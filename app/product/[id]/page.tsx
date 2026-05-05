import { getProduct } from "@/lib/products";

export default function ProductPage({ params }: { params: { id: string } }) {
  const product = getProduct(params.id);

  if (!product) return <div>Produs inexistent</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{product.title}</h1>
      <p className="text-gray-500">Livrare: {product.delivery}</p>

      <div className="text-3xl font-bold mt-4">{product.price} lei</div>

      <div className="mt-4">
        {product.benefits.map((b) => (
          <div key={b}>✓ {b}</div>
        ))}
      </div>

      <button className="mt-6 w-full bg-black text-white p-4 rounded-lg">
        Adauga in cos
      </button>
    </div>
  );
}
