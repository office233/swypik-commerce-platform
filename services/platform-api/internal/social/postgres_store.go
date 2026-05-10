package social

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresStore implements Store using the follows table in PostgreSQL.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore creates a PostgreSQL-backed social store.
func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{pool: pool}
}

// SetFollow inserts or deletes a follow relationship.
// Uses ON CONFLICT for idempotent follow, and DELETE for unfollow.
func (s *PostgresStore) SetFollow(ctx context.Context, followerID, followeeID string, following bool, updatedAt time.Time) (FollowResult, error) {
	result := FollowResult{
		FollowerID: followerID,
		FolloweeID: followeeID,
		Following:  following,
		UpdatedAt:  updatedAt,
	}

	if following {
		_, err := s.pool.Exec(ctx, `
			INSERT INTO follows (follower_id, following_id, created_at)
			VALUES ($1, $2, $3)
			ON CONFLICT (follower_id, following_id) DO NOTHING
		`, followerID, followeeID, updatedAt)
		if err != nil {
			return FollowResult{}, fmt.Errorf("social.PostgresStore.SetFollow insert: %w", err)
		}
	} else {
		_, err := s.pool.Exec(ctx, `
			DELETE FROM follows
			WHERE follower_id = $1 AND following_id = $2
		`, followerID, followeeID)
		if err != nil {
			return FollowResult{}, fmt.Errorf("social.PostgresStore.SetFollow delete: %w", err)
		}
	}

	return result, nil
}
