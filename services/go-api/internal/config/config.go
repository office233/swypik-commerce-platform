package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port               string
	DatabaseURL        string
	RedisURL           string
	CORSAllowedOrigins []string
	UploadBaseURL      string
	CheckoutBaseURL    string
	RequestTimeout     time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		Port:               env("PORT", "8080"),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		RedisURL:           os.Getenv("REDIS_URL"),
		CORSAllowedOrigins: splitCSV(env("CORS_ALLOWED_ORIGINS", "*")),
		UploadBaseURL:      strings.TrimRight(env("UPLOAD_BASE_URL", "https://uploads.aicevrei.local"), "/"),
		CheckoutBaseURL:    strings.TrimRight(env("CHECKOUT_BASE_URL", "https://aicevrei.local/checkout"), "/"),
		RequestTimeout:     time.Duration(envInt("REQUEST_TIMEOUT_SECONDS", 10)) * time.Second,
	}
	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	return cfg, nil
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv(key)))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	if len(out) == 0 {
		return []string{"*"}
	}
	return out
}
