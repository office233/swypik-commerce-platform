package feed

import "testing"

func TestRankScoreRewardsVideoEngagementRatingAndRecency(t *testing.T) {
	withVideo := Item{
		ID:          1,
		Title:       "video product",
		VideoURL:    "https://cdn.aicevrei.test/video.mp4",
		Rating:      4.8,
		OrdersCount: 250,
		LikesCount:  40,
		ViewsCount:  2000,
		AgeHours:    6,
	}
	withoutVideo := Item{
		ID:          2,
		Title:       "static product",
		Rating:      4.8,
		OrdersCount: 250,
		LikesCount:  40,
		ViewsCount:  2000,
		AgeHours:    6,
	}

	if RankScore(withVideo) <= RankScore(withoutVideo) {
		t.Fatalf("expected item with video to outrank fallback item: video=%f fallback=%f", RankScore(withVideo), RankScore(withoutVideo))
	}
}

func TestSortRankedOrdersHighestScoresFirst(t *testing.T) {
	items := []Item{
		{ID: 1, Title: "older", Rating: 3.2, OrdersCount: 5, AgeHours: 300},
		{ID: 2, Title: "strong", VideoURL: "https://cdn.test/v.mp4", Rating: 4.9, OrdersCount: 100, LikesCount: 20, ViewsCount: 500, AgeHours: 2},
		{ID: 3, Title: "middle", Rating: 4.1, OrdersCount: 20, AgeHours: 20},
	}

	SortRanked(items)

	if items[0].ID != 2 {
		t.Fatalf("expected highest scoring item first, got id %d", items[0].ID)
	}
	if items[0].RankScore < items[1].RankScore || items[1].RankScore < items[2].RankScore {
		t.Fatalf("expected scores descending, got %f >= %f >= %f", items[0].RankScore, items[1].RankScore, items[2].RankScore)
	}
}
