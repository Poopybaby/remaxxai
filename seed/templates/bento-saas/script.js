// Demo: tickets arrive and get auto-assigned by a rule.
var tickets = [
  ["Invoice shows the wrong VAT", "Priya"],
  ["App crashes on export", "Dev on call"],
  ["Can I add a second seat?", "Priya"],
  ["Password reset email never came", "Support"],
  ["Feature idea: dark mode", "Product"],
];
var queue = document.getElementById("queue");
var i = 0;

function addTicket() {
  var t = tickets[i % tickets.length];
  var row = document.createElement("div");
  row.className = "row new";
  row.innerHTML = "<span></span><b></b>";
  row.querySelector("span").textContent = t[0];
  row.querySelector("b").textContent = "→ " + t[1];
  queue.prepend(row);
  setTimeout(function () { row.classList.remove("new"); }, 900);
  while (queue.children.length > 3) queue.lastChild.remove();
  i++;
}

addTicket();
addTicket();
addTicket();
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setInterval(addTicket, 2600);

document.getElementById("go").addEventListener("click", function () {
  var email = document.getElementById("email").value.trim();
  document.getElementById("msg").textContent = /\S+@\S+\.\S+/.test(email)
    ? "Check " + email + " for your invite link."
    : "Enter your work email to get started.";
});
