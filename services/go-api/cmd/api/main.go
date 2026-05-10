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

	"github.com/aicevrei/aicevrei/services/go-api/internal/cache"
	"github.com/aicevrei/aicevrei/services/go-api/internal/config"
	"github.com/aicevrei/aicevrei/services/go-api/internal/httpapi"
	"github.com/aicevrei/aicevrei/services/go-api/internal/store"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	db, err := store.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("postgres initialization failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	redisCache := cache.NewNoop()
	if cfg.RedisURL != "" {
		if client, err := cache.NewRedis(ctx, cfg.RedisURL); err != nil {
			slog.Warn("redis unavailable; continuing without redis", "error", err)
		} else {
			redisCache = client
			defer redisCache.Close()
		}
	}

	api := httpapi.NewServer(httpapi.Dependencies{
		Config: cfg,
		Store:  db,
		Cache:  redisCache,
		Logger: slog.Default(),
	})

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		slog.Info("go-api listening", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("http server failed", "error", err)
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
}
