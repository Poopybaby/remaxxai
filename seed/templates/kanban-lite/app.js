// Lanes: a kanban board in plain JavaScript. State lives in memory, and in localStorage
// when the page is allowed to use it (sandboxed previews aren't).
var LANES = ["todo", "doing", "done"];
var TAGS = { design: "#ffe1ec", dev: "#dff5ff", ops: "#e8ffe0" };

var store = (function () {
  try { localStorage.setItem("probe", "1"); localStorage.removeItem("probe"); return localStorage; } catch (e) { return null; }
})();

var cards = [
  { id: 1, title: "Sketch the onboarding flow", lane: "todo", tag: "design" },
  { id: 2, title: "Set up error logging", lane: "todo", tag: "ops" },
  { id: 3, title: "Build the settings page", lane: "doing", tag: "dev" },
  { id: 4, title: "Pick a color palette", lane: "done", tag: "design" },
];
if (store && store.getItem("lanes")) {
  try { cards = JSON.parse(store.getItem("lanes")); } catch (e) { /* keep defaults */ }
}

function save() { if (store) store.setItem("lanes", JSON.stringify(cards)); }

function move(id, lane) {
  cards = cards.map(function (c) { return c.id === id ? Object.assign({}, c, { lane: lane }) : c; });
  save();
  render();
}

function render() {
  LANES.forEach(function (lane) {
    var section = document.querySelector('[data-lane="' + lane + '"]');
    var list = section.querySelector(".cards");
    var mine = cards.filter(function (c) { return c.lane === lane; });
    section.querySelector(".count").textContent = mine.length;
    list.innerHTML = "";
    mine.forEach(function (c) {
      var el = document.createElement("article");
      el.className = "card";
      el.draggable = true;
      el.dataset.id = c.id;
      var body = document.createElement("div");
      var tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = c.tag;
      tag.style.background = TAGS[c.tag] || "#eee";
      var p = document.createElement("p");
      p.textContent = c.title;
      body.append(tag, p);
      var moves = document.createElement("div");
      moves.className = "moves";
      var i = LANES.indexOf(lane);
      if (i > 0) moves.append(button("←", "Move left", function () { move(c.id, LANES[i - 1]); }));
      if (i < LANES.length - 1) moves.append(button("→", "Move right", function () { move(c.id, LANES[i + 1]); }));
      el.append(body, moves);
      el.addEventListener("dragstart", function (e) { el.classList.add("dragging"); e.dataTransfer.setData("text/plain", String(c.id)); });
      el.addEventListener("dragend", function () { el.classList.remove("dragging"); });
      list.append(el);
    });
  });
}

function button(label, aria, onClick) {
  var b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.setAttribute("aria-label", aria);
  b.addEventListener("click", onClick);
  return b;
}

document.querySelectorAll(".lane").forEach(function (lane) {
  lane.addEventListener("dragover", function (e) { e.preventDefault(); lane.classList.add("over"); });
  lane.addEventListener("dragleave", function () { lane.classList.remove("over"); });
  lane.addEventListener("drop", function (e) {
    e.preventDefault();
    lane.classList.remove("over");
    move(Number(e.dataTransfer.getData("text/plain")), lane.dataset.lane);
  });
});

function addCard() {
  var input = document.getElementById("title");
  var title = input.value.trim();
  if (!title) return;
  var tags = Object.keys(TAGS);
  cards.push({ id: Date.now(), title: title, lane: "todo", tag: tags[cards.length % tags.length] });
  input.value = "";
  save();
  render();
}
document.getElementById("add").addEventListener("click", addCard);
document.getElementById("title").addEventListener("keydown", function (e) { if (e.key === "Enter") addCard(); });

render();
