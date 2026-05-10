package cache

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

type Cache interface {
	Close() error
	Enabled() bool
	Ping(context.Context) error
	PublishEvent(context.Context, string, []byte) error
}

type Noop struct{}

func NewNoop() Noop {
	return Noop{}
}

func (Noop) Close() error {
	return nil
}

func (Noop) Enabled() bool {
	return false
}

func (Noop) Ping(context.Context) error {
	return nil
}

func (Noop) PublishEvent(context.Context, string, []byte) error {
	return nil
}

type Redis struct {
	client *redis.Client
}

func NewRedis(ctx context.Context, redisURL string) (*Redis, error) {
	options, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	client := redis.NewClient(options)
	pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := client.Ping(pingCtx).Err(); err != nil {
		_ = client.Close()
		return nil, err
	}
	return &Redis{client: client}, nil
}

func (r *Redis) Close() error {
	return r.client.Close()
}

func (r *Redis) Enabled() bool {
	return true
}

func (r *Redis) Ping(ctx context.Context) error {
	return r.client.Ping(ctx).Err()
}

func (r *Redis) PublishEvent(ctx context.Context, channel string, payload []byte) error {
	return r.client.Publish(ctx, channel, payload).Err()
}
