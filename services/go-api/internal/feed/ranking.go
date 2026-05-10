package feed

import (
	"math"
	"sort"
	"strings"
)

type Item struct {
	ID          int64    `json:"id"`
	AEProductID string   `json:"ae_product_id,omitempty"`
	Title       string   `json:"title"`
	PriceRON    int      `json:"price_ron,omitempty"`
	OldPriceRON int      `json:"old_price_ron,omitempty"`
	ImageURL    string   `json:"image_url,omitempty"`
	VideoURL    string   `json:"video_url,omitempty"`
	PosterURL   string   `json:"poster_url,omitempty"`
	Rating      float64  `json:"rating,omitempty"`
	OrdersCount int      `json:"orders_count,omitempty"`
	LikesCount  int      `json:"likes_count,omitempty"`
	ViewsCount  int      `json:"views_count,omitempty"`
	AgeHours    float64  `json:"-"`
	CategoryID  int      `json:"category_id,omitempty"`
	Category    string   `json:"category,omitempty"`
	SourceURL   string   `json:"source_url,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	RankScore   float64  `json:"rank_score"`
}

func RankScore(item Item) float64 {
	score := 0.0
	if strings.TrimSpace(item.VideoURL) != "" {
		score += 30
	}
	score += clamp(item.Rating, 0, 5) * 8
	score += math.Log1p(float64(max(item.OrdersCount, 0))) * 4
	score += math.Log1p(float64(max(item.LikesCount, 0))) * 5
	score += math.Log1p(float64(max(item.ViewsCount, 0))) * 1.5
	if item.PriceRON > 0 && item.OldPriceRON > item.PriceRON {
		discount := float64(item.OldPriceRON-item.PriceRON) / float64(item.OldPriceRON)
		score += clamp(discount, 0, 0.8) * 18
	}
	score += recencyBoost(item.AgeHours)
	return math.Round(score*1000) / 1000
}

func SortRanked(items []Item) {
	for idx := range items {
		items[idx].RankScore = RankScore(items[idx])
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].RankScore == items[j].RankScore {
			return items[i].ID > items[j].ID
		}
		return items[i].RankScore > items[j].RankScore
	})
}

func recencyBoost(ageHours float64) float64 {
	if ageHours <= 0 {
		return 8
	}
	if ageHours >= 24*30 {
		return 0
	}
	return 8 * math.Exp(-ageHours/(24*7))
}

func clamp(value, low, high float64) float64 {
	return math.Max(low, math.Min(high, value))
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
