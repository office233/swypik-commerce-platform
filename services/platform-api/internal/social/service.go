package social

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

var ErrValidation = errors.New("validation failed")

type FollowInput struct {
	FollowerID string `json:"follower_id"`
	FolloweeID string `json:"followee_id"`
}

type FollowResult struct {
	FollowerID string    `json:"follower_id"`
	FolloweeID string    `json:"followee_id"`
	Following  bool      `json:"following"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type Store interface {
	SetFollow(context.Context, string, string, bool, time.Time) (FollowResult, error)
}

type Service struct {
	store Store
	clock func() time.Time
}

func NewService(store Store, clock func() time.Time) *Service {
	if store == nil {
		store = NewMemoryStore()
	}
	if clock == nil {
		clock = time.Now
	}
	return &Service{store: store, clock: clock}
}

func (s *Service) Follow(ctx context.Context, input FollowInput) (FollowResult, error) {
	followerID, followeeID, err := validateFollow(input)
	if err != nil {
		return FollowResult{}, err
	}
	return s.store.SetFollow(ctx, followerID, followeeID, true, s.clock().UTC())
}

func (s *Service) Unfollow(ctx context.Context, input FollowInput) (FollowResult, error) {
	followerID, followeeID, err := validateFollow(input)
	if err != nil {
		return FollowResult{}, err
	}
	return s.store.SetFollow(ctx, followerID, followeeID, false, s.clock().UTC())
}

func validateFollow(input FollowInput) (string, string, error) {
	followerID := strings.TrimSpace(input.FollowerID)
	followeeID := strings.TrimSpace(input.FolloweeID)
	if followerID == "" {
		return "", "", validationError("follower_id is required")
	}
	if followeeID == "" {
		return "", "", validationError("followee_id is required")
	}
	if followerID == followeeID {
		return "", "", validationError("follower_id and followee_id must differ")
	}
	return followerID, followeeID, nil
}

func validationError(message string) error {
	return fmt.Errorf("%w: %s", ErrValidation, message)
}

type MemoryStore struct {
	mu      sync.RWMutex
	follows map[string]FollowResult
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{follows: make(map[string]FollowResult)}
}

func (s *MemoryStore) SetFollow(_ context.Context, followerID, followeeID string, following bool, updatedAt time.Time) (FollowResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := followerID + "->" + followeeID
	result := FollowResult{
		FollowerID: followerID,
		FolloweeID: followeeID,
		Following:  following,
		UpdatedAt:  updatedAt,
	}
	if following {
		s.follows[key] = result
	} else {
		delete(s.follows, key)
	}
	return result, nil
}
