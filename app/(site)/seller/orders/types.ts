export type SellerOrderItem = {
  item_id: string;
  title: string;
  quantity: number;
  unit_amount_cents: number;
  metadata?: {
    tracking_number?: string;
    tracking_url?: string;
    carrier?: string;
    seller_id?: string;
  } | null;
  source_status?: string | null;
};

export type SellerShippingAddress = {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
};

export type SellerAwbDetails = {
  awb_number: string;
  carrier: string;
  courier_code?: string;
  parcels_count?: number;
  weight_kg?: number;
  notes?: string | null;
  locker_name?: string | null;
  generated_at?: string;
  tracking_url?: string | null;
};

export type SellerOrderMetadata = {
  tracking_number?: string | null;
  tracking_url?: string | null;
  tracking_carrier?: string | null;
  shipping_method?: string | null;
  shipping_address?: SellerShippingAddress | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  easybox_locker?: string | null;
  awb_details?: SellerAwbDetails | null;
  return_reason?: string | null;
  return_requested_at?: string | null;
};

export type SellerOrder = {
  order_id: string;
  order_status: string;
  status: string;
  status_label?: string;
  created_at: string;
  total_cents: number;
  items: SellerOrderItem[];
  order_metadata: SellerOrderMetadata;
};
