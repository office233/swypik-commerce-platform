package checkout

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

var ErrValidation = errors.New("validation failed")

type AddCartItemInput struct {
	CartID        string `json:"cart_id,omitempty"`
	UserID        string `json:"user_id,omitempty"`
	ProductID     string `json:"product_id"`
	SKUID         string `json:"sku_id,omitempty"`
	Quantity      int    `json:"quantity"`
	UnitAmountRON int    `json:"unit_amount_ron,omitempty"`
}

type CartItem struct {
	ID            string    `json:"id"`
	CartID        string    `json:"cart_id"`
	UserID        string    `json:"user_id,omitempty"`
	ProductID     string    `json:"product_id"`
	SKUID         string    `json:"sku_id,omitempty"`
	Quantity      int       `json:"quantity"`
	UnitAmountRON int       `json:"unit_amount_ron"`
	CreatedAt     time.Time `json:"created_at"`
}

type CheckoutInput struct {
	CartID   string             `json:"cart_id,omitempty"`
	UserID   string             `json:"user_id,omitempty"`
	Currency string             `json:"currency,omitempty"`
	Items    []AddCartItemInput `json:"items,omitempty"`
	Customer Customer           `json:"customer,omitempty"`
	Metadata map[string]any     `json:"metadata,omitempty"`
}

type Customer struct {
	Name  string `json:"name,omitempty"`
	Email string `json:"email,omitempty"`
	Phone string `json:"phone,omitempty"`
}

type CheckoutResult struct {
	CheckoutID     string     `json:"checkout_id"`
	Status         string     `json:"status"`
	PaymentURL     string     `json:"payment_url"`
	Currency       string     `json:"currency"`
	TotalAmountRON int        `json:"total_amount_ron"`
	Items          []CartItem `json:"items"`
}

type StripeWebhookResult struct {
	Received  bool   `json:"received"`
	EventID   string `json:"event_id,omitempty"`
	EventType string `json:"event_type,omitempty"`
}

type Store interface {
	AddCartItem(context.Context, CartItem) (CartItem, error)
	ListCartItems(context.Context, string) ([]CartItem, error)
}

type Service struct {
	store              Store
	clock              func() time.Time
	checkoutBaseURL    string
	defaultUnitAmount  int
	defaultPaymentHost string
}

func NewService(store Store, clock func() time.Time) *Service {
	if store == nil {
		store = NewMemoryStore()
	}
	if clock == nil {
		clock = time.Now
	}
	return &Service{
		store:              store,
		clock:              clock,
		checkoutBaseURL:    "https://aicevrei.local/checkout",
		defaultUnitAmount:  1000,
		defaultPaymentHost: "https://pay.aicevrei.local",
	}
}

func (s *Service) AddCartItem(ctx context.Context, input AddCartItemInput) (CartItem, error) {
	if err := validateCartItem(input); err != nil {
		return CartItem{}, err
	}
	cartID := strings.TrimSpace(input.CartID)
	if cartID == "" {
		cartID = newID("cart")
	}
	unitAmount := input.UnitAmountRON
	if unitAmount <= 0 {
		unitAmount = s.defaultUnitAmount
	}
	item := CartItem{
		ID:            newID("cart_item"),
		CartID:        cartID,
		UserID:        strings.TrimSpace(input.UserID),
		ProductID:     strings.TrimSpace(input.ProductID),
		SKUID:         strings.TrimSpace(input.SKUID),
		Quantity:      input.Quantity,
		UnitAmountRON: unitAmount,
		CreatedAt:     s.clock().UTC(),
	}
	return s.store.AddCartItem(ctx, item)
}

func (s *Service) Checkout(ctx context.Context, input CheckoutInput) (CheckoutResult, error) {
	currency := strings.ToUpper(strings.TrimSpace(input.Currency))
	if currency == "" {
		currency = "RON"
	}
	if currency != "RON" {
		return CheckoutResult{}, validationError("currency must be RON")
	}

	items := make([]CartItem, 0, len(input.Items))
	if len(input.Items) > 0 {
		for _, itemInput := range input.Items {
			item, err := s.AddCartItem(ctx, itemInput)
			if err != nil {
				return CheckoutResult{}, err
			}
			items = append(items, item)
		}
	} else if strings.TrimSpace(input.CartID) != "" {
		cartItems, err := s.store.ListCartItems(ctx, strings.TrimSpace(input.CartID))
		if err != nil {
			return CheckoutResult{}, err
		}
		items = append(items, cartItems...)
	}
	if len(items) == 0 {
		return CheckoutResult{}, validationError("items or cart_id is required")
	}
	if input.Customer.Email != "" && !strings.Contains(input.Customer.Email, "@") {
		return CheckoutResult{}, validationError("customer.email is invalid")
	}

	total := 0
	for _, item := range items {
		total += item.UnitAmountRON * item.Quantity
	}
	checkoutID := newID("chk")
	return CheckoutResult{
		CheckoutID:     checkoutID,
		Status:         "requires_payment",
		PaymentURL:     strings.TrimRight(s.defaultPaymentHost, "/") + "/" + checkoutID,
		Currency:       currency,
		TotalAmountRON: total,
		Items:          items,
	}, nil
}

func (s *Service) RecordStripeWebhook(_ context.Context, payload []byte) (StripeWebhookResult, error) {
	if len(payload) == 0 {
		return StripeWebhookResult{}, validationError("payload is required")
	}
	var decoded struct {
		ID   string `json:"id"`
		Type string `json:"type"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return StripeWebhookResult{}, validationError("payload must be valid JSON")
	}
	return StripeWebhookResult{Received: true, EventID: decoded.ID, EventType: decoded.Type}, nil
}

func validateCartItem(input AddCartItemInput) error {
	if strings.TrimSpace(input.ProductID) == "" {
		return validationError("product_id is required")
	}
	if input.Quantity <= 0 || input.Quantity > 20 {
		return validationError("quantity must be between 1 and 20")
	}
	if input.UnitAmountRON < 0 {
		return validationError("unit_amount_ron cannot be negative")
	}
	return nil
}

func validationError(message string) error {
	return fmt.Errorf("%w: %s", ErrValidation, message)
}

type MemoryStore struct {
	mu    sync.RWMutex
	carts map[string][]CartItem
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{carts: make(map[string][]CartItem)}
}

func (s *MemoryStore) AddCartItem(_ context.Context, item CartItem) (CartItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.carts[item.CartID] = append(s.carts[item.CartID], item)
	return item, nil
}

func (s *MemoryStore) ListCartItems(_ context.Context, cartID string) ([]CartItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]CartItem(nil), s.carts[cartID]...), nil
}

func newID(prefix string) string {
	var bytes [12]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano())
	}
	return prefix + "_" + hex.EncodeToString(bytes[:])
}
