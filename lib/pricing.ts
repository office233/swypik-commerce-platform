export function calculateSellPrice(costTotal: number) {
  let markup = 2.2;

  if (costTotal < 30) markup = 3.2;
  else if (costTotal < 80) markup = 2.6;
  else if (costTotal < 150) markup = 2.2;
  else if (costTotal < 300) markup = 1.8;
  else markup = 1.5;

  const net = costTotal * markup;
  const withVat = net * 1.19;

  return roundPrice(withVat);
}

function roundPrice(value: number) {
  const rounded = Math.ceil(value / 10) * 10 - 1;
  return rounded;
}
