export class RazorpayService {
  createOrder(amount) {
    return {
      amount,
      provider: "razorpay",
      status: "READY"
    };
  }
}