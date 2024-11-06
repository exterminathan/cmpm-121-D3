//create button
const button = document.createElement("button");
button.textContent = "Click";

button.addEventListener("click", () => {
  alert("you clicked the button!");
});

//add to doc
document.body.append(button);
