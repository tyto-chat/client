(function () {
  if ((localStorage.getItem("theme") ?? "dark") === "dark") {
    document.documentElement.classList.add("dark");
  }
  var fs = localStorage.getItem("fontSize");
  if (fs) document.documentElement.style.fontSize = fs;
})();
