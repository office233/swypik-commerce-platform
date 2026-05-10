package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all platform-api configuration. Values are loaded from
// environment variables with sensible defaults for local development.
type Config struct {
	// Server
	Host        string
	Port        int
	Environment string
	LogLevel    string
	CORSOrigins []string

	// PostgreSQL
	DatabaseURL string

	// Redis
	RedisURL string

	// Upload / S3 / R2
	PublicUploadBaseURL string
	UploadTTL          time.Duration
	S3Endpoint         string
	S3Region           string
	S3AccessKeyID      string
	S3SecretAccessKey  string
	S3MediaBucket      string
	S3ForcePathStyle   bool

	// Stripe
	StripeSecretKey     string
	StripeWebhookSecret string

	// ClickHouse
	ClickHouseURL string
}

// Load reads configuration from environment variables.
func Load() Config {
	return Config{
		// Server
		Host:        envOr("HOST", "0.0.0.0"),
		Port:        envIntOr("PORT", 8080),
		Environment: envOr("ENVIRONMENT", "development"),
		LogLevel:    envOr("LOG_LEVEL", "info"),
		CORSOrigins: splitCSV(envOr("CORS_ALLOWED_ORIGINS", "*")),

		// PostgreSQL
		DatabaseURL: os.Getenv("DATABASE_URL"),

		// Redis
		RedisURL: os.Getenv("REDIS_URL"),

		// Upload / S3 / R2
		PublicUploadBaseURL: strings.TrimRight(envOr("PUBLIC_UPLOAD_BASE_URL", "https://uploads.swypik.local"), "/"),
		UploadTTL:          time.Duration(envIntOr("UPLOAD_TTL_MINUTES", 15)) * time.Minute,
		S3Endpoint:         os.Getenv("S3_ENDPOINT"),
		S3Region:           envOr("S3_REGION", "auto"),
		S3AccessKeyID:      os.Getenv("S3_ACCESS_KEY_ID"),
		S3SecretAccessKey:  os.Getenv("S3_SECRET_ACCESS_KEY"),
		S3MediaBucket:      envOr("S3_MEDIA_BUCKET", "social-media"),
		S3ForcePathStyle:   envBoolOr("S3_FORCE_PATH_STYLE", true),

		// Stripe
		StripeSecretKey:     os.Getenv("STRIPE_SECRET_KEY"),
		StripeWebhookSecret: os.Getenv("STRIPE_WEBHOOK_SECRET"),

		// ClickHouse
		ClickHouseURL: os.Getenv("CLICKHOUSE_URL"),
	}
}

// Addr returns the host:port address for http.Server.
func (c Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// IsDev returns true when running in development mode.
func (c Config) IsDev() bool {
	return c.Environment == "development" || c.Environment == ""
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envIntOr(key string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv(key)))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func envBoolOr(key string, fallback bool) bool {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	switch raw {
	case "true", "1", "yes":
		return true
	case "false", "0", "no":
		return false
	default:
		return fallback
	}
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
