export async function sendOrderConfirmation(email: string, orderDetails: any) {
  console.log(`[Email Mock] Sending Order Confirmation to ${email}:`, JSON.stringify(orderDetails, null, 2));
}

export async function sendSellerNotification(sellerEmail: string, items: any[]) {
  console.log(`[Email Mock] Sending Seller Notification to ${sellerEmail} for ${items.length} items`);
}
