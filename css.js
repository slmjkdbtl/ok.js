window.css = (() => {

function compile(list) {

	let code = "";

	function handleSheet(s) {
		let t = "{";
		for (const k in s) {
			t += `${k}:${s[k]};`;
		}
		t += "}";
		return t;
	}

	function handleSheetEx(sel, sheet) {
		let t = sel + " {";
		let post = "";
		for (const key in sheet) {
			const val = sheet[key];
			// media
			if (key === "@media") {
				for (const cond in val) {
					post += `@media ${cond} {${sel}${handleSheet(val[cond])}}`;
				}
			// pseudo class
			} else if (key[0] === ":") {
				post += handleSheetEx(sel + key, val);
			// self
			} else if (key[0] === "&") {
				post += handleSheetEx(sel + key.substring(1), val);
			// nesting child
			} else if (typeof(val) === "object") {
				post += handleSheetEx(sel + " " + key, val);
			} else {
				t += `${key}:${val};`;
			}
		}
		t += "}" + post;
		return t;
	}

	for (const sel in list) {
		const sheet = list[sel];
		if (sel === "@keyframes") {
			for (const name in sheet) {
				const map = sheet[name];
				code += `@keyframes ${name} {`;
				for (const time in map) {
					code += time + handleSheet(map[time]);
				}
				code += "}";
			}
		} else {
			code += handleSheetEx(sel, sheet);
		}
	}

	return code;

}

function add(list) {
	const el = document.createElement("style");
	el.textContent = compile(list);
	document.head.appendChild(el);
}

function setVar(name, val) {
	document.documentElement.style.setProperty(name, val);
}

return {
	compile,
	add,
	setVar,
};

})();
