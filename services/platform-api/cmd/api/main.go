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

	"github.com/office233/aicevrei/services/platform-api/internal/platform/config"
	"github.com/office233/aicevrei/services/platform-api/internal/platform/db"
	platformhttp "github.com/office233/aicevrei/services/platform-api/internal/platform/http"
	"github.com/office233/aicevrei/services/platform-api/internal/platform/logger"
	"github.com/office233/aicevrei/services/platform-api/internal/platform/redis"
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

	_ = pgPool // Will be used to construct PostgreSQL repositories in Phase 0.2

	// ── HTTP Server ────────────────────────────────────────────────
	router := platformhttp.NewRouter(platformhttp.Dependencies{
		Config: cfg,
		Logger: log,
		DB:     dbChecker,
		Redis:  redisClient,
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
		log.Info("platform-api listening",
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
	log.Info("platform-api stopped gracefully")
}
