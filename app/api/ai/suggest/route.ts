import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { description, product_name } = body;

    // Simulate AI processing delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Mock response based on input
    const productName = product_name || "acest produs";
    const hooks = [
      `Nu știam că poți face asta cu ${productName}...`,
      `Test 7 zile cu ${productName}. Iată rezultatul!`,
      `Cel mai bun ${productName} de pe piață chiar acum!`,
    ];

    const captions = [
      `Am încercat ${productName} și sunt complet surprins de rezultate! 😍 Voi ce părere aveți? #musthave #${productName.replace(/\s+/g, "").toLowerCase()} #recomandare`,
      `Dacă încă nu folosești ${productName}, ratezi ceva incredibil! ✨ Lasă un comentariu dacă vrei link-ul. #viral #${productName.replace(/\s+/g, "").toLowerCase()} #trending`,
    ];

    return NextResponse.json({ hooks, captions });
  } catch (error) {
    console.error("AI Suggestion API Error:", error);
    return NextResponse.json(
      { error: "A apărut o eroare la generarea sugestiilor." },
      { status: 500 }
    );
  }
}
