package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/office233/swypik/services/platform-api/internal/checkout"
	"github.com/office233/swypik/services/platform-api/internal/events"
	"github.com/office233/swypik/services/platform-api/internal/feed"
	"github.com/office233/swypik/services/platform-api/internal/moderation"
	"github.com/office233/swypik/services/platform-api/internal/platform/config"
	"github.com/office233/swypik/services/platform-api/internal/platform/db"
	platformhttp "github.com/office233/swypik/services/platform-api/internal/platform/http"
	"github.com/office233/swypik/services/platform-api/internal/platform/logger"
	"github.com/office233/swypik/services/platform-api/internal/platform/redis"
	"github.com/office233/swypik/services/platform-api/internal/social"
	"github.com/office233/swypik/services/platform-api/internal/videos"
)

func main() {
	cfg := config.Load()
	log := logger.New(cfg.LogLevel)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// ── Database ───────────────────────────────────────────────────
	var dbChecker db.HealthChecker = db.NewNoop()
	var pgPool *db.Pool

	if cfg.DatabaseURL != "" {
		connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		pool, err := db.New(connectCtx, db.DefaultConfig(cfg.DatabaseURL), log)
		cancel()
		if err != nil {
			log.Warn("postgres unavailable, running with in-memory stores", "error", err)
		} else {
			pgPool = pool
			dbChecker = pool
			defer pool.Close()
		}
	} else {
		log.Info("DATABASE_URL not set, running with in-memory stores")
	}

	// ── Redis ──────────────────────────────────────────────────────
	var redisClient redis.Client = redis.NewNoop()

	if cfg.RedisURL != "" {
		connectCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		rc, err := redis.New(connectCtx, redis.DefaultConfig(cfg.RedisURL), log)
		cancel()
		if err != nil {
			log.Warn("redis unavailable, running without streams/cache", "error", err)
		} else {
			redisClient = rc
			defer rc.Close()
		}
	} else {
		log.Info("REDIS_URL not set, running without streams/cache")
	}

	// ── Repositories ──────────────────────────────────────────────
	var feedRepo feed.Repository
	var socialStore social.Store
	var eventsStore events.Store
	var eventsPublisher events.Publisher
	var videoStore videos.UploadStore
	var checkoutStore checkout.Store
	var moderationSvc *moderation.Service

	if pgPool != nil {
		feedRepo = feed.NewPostgresRepository(pgPool.Pool())
		socialStore = social.NewPostgresStore(pgPool.Pool())
		eventsStore = events.NewPostgresStore(pgPool.Pool())
		videoStore = videos.NewPostgresUploadStore(pgPool.Pool())
		checkoutStore = checkout.NewPostgresStore(pgPool.Pool())
		pgMod := moderation.NewPostgresService(pgPool.Pool())
		_ = pgMod // moderation uses PostgresService.ListCases directly
		log.Info("repositories: using PostgreSQL")
	} else {
		log.Info("repositories: using in-memory (no DB)")
	}

	if rc, ok := redisClient.(*redis.RedisClient); ok && rc.Enabled() {
		eventsPublisher = events.NewRedisPublisher(rc, cfg.RedisStreamEvents, log)
		log.Info("events publisher: Redis Streams")
	}

	// ── HTTP Server ────────────────────────────────────────────────
	router := platformhttp.NewRouter(platformhttp.Dependencies{
		Config: cfg,
		Logger: log,
		Feed:   feed.NewService(feedRepo, time.Now),
		Events: events.NewService(eventsStore, eventsPublisher),
		Videos: videos.NewUploadService(videoStore, videos.UploadConfig{
			PublicUploadBaseURL: cfg.PublicUploadBaseURL,
			UploadTTL:           cfg.UploadTTL,
			StorageProvider:     cfg.S3StorageProvider,
			Bucket:              cfg.S3MediaBucket,
			Redis:               redisClient,
			RedisStream:         cfg.RedisStreamVideoJobs,
			Clock:               time.Now,
		}),
		Social:     social.NewService(socialStore, time.Now),
		Checkout:   checkout.NewService(checkoutStore, time.Now),
		Moderation: moderationSvc,
		DB:         dbChecker,
		Redis:      redisClient,
	})

	server := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Info("swypik-api listening",
			"addr", server.Addr,
			"env", cfg.Environment,
			"postgres", dbChecker.Enabled(),
			"redis", redisClient.Enabled(),
		)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("http server failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("http shutdown failed", "error", err)
		os.Exit(1)
	}
	log.Info("swypik-api stopped gracefully")
}
