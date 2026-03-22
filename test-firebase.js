const obj = { precios: undefined };
const clean = Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
console.log(clean);
