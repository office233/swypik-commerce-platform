SELECT count(*) as total_videos, count(product_refs) as with_refs FROM videos WHERE status='ready';
