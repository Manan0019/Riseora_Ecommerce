export default function IngredientSection(){
 const ingredients=["Neem","Bhringraj","Amla"];
 return (
  <section>
   {ingredients.map(i=><div key={i}>{i}</div>)}
  </section>
 );
}