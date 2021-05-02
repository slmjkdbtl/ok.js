window.ui = () => {

const dynList = {};
const domReg = {};
let lastID = 0;

// comp def shortcut
function t(tag, props, children) {
	return {
		tag,
		props,
		children,
	};
}

// compile a comp to DOM element and resolve dynamic content
function compile(obj) {

	// TODO: support shortcut for #id
	const segs = obj.tag.split(".");
	const el = document.createElement(segs[0] || "div");
	const className = segs[1] ? segs.splice(1).join(" ") : "";
	const handlers = [];

	if (className) {
		el.className = className;
	}

	function setProp(k, v) {
		if (k === "class") {
			el.className = v.join(" ");
			if (className) {
				el.className += " " + className;
			}
		} else if (k === "style") {
			for (const s in v) {
				el.style[s] = v[s];
			}
		} else {
			el[k] = v;
			if (k === "id") {
				domReg[v] = el;
			}
		}
	}

	for (const key in obj.props) {

		const val = obj.props[key];

		if (val == null) {
			continue;
		}

		if (typeof val === "function") {

			if (key.startsWith("on")) {
				// event handler
				el.addEventListener(key.substring(2), (e) => {
					const res = val.call(el, e);
					if (res !== false) {
						redraw();
					}
				});
			} else {
				// dynamic prop
				const makeVal = val.bind(el);
				handlers.push(() => {
					// TODO: is it worth it to diff here?
					setProp(key, makeVal());
				}),
				setProp(key, makeVal());
			}

		} else {
			// static prop
			setProp(key, val);
		}

	}

	function setChildren(children) {
		if (Array.isArray(children)) {
			while (el.firstChild) {
				cleanup(el.firstChild);
				el.removeChild(el.firstChild);
			}
			for (const child of children) {
				if (child) {
					render(el, child);
				}
			}
		} else if (children != null) {
			el.textContent = children;
		}
	}

	if (typeof obj.children === "function") {

		// dynamic children
		const makeChildren = obj.children.bind(el);
		let prevChildren = makeChildren();

		handlers.push(() => {
			const children = makeChildren();
			// TODO: more sophisticated diff
			if (!deepEq(children, prevChildren)) {
				setChildren(children);
			}
			prevChildren = children;
		});

		setChildren(prevChildren);

	} else {
		// static children
		setChildren(obj.children);
	}

	// only push to dyn list if have any dynamic stuff
	if (handlers.length > 0) {
		el._id = lastID++;
		dynList[el._id] = handlers;
	}

	return el;

}

// resolve everything in the dyn list
function redraw() {
	for (const id in dynList) {
		for (const cb of dynList[id]) {
			cb();
		}
	}
}

// remove trashed elements in dyn list
function cleanup(el) {
	[...el.children].forEach(cleanup);
	if (el._id != null) {
		delete dynList[el._id];
	}
	if (el.id) {
		delete domReg[el.id];
	}
}

// mount component to a DOM node
function render(root, obj) {
	if (Array.isArray(obj)) {
		for (const c of obj) {
			render(root, c);
		}
	} else {
		root.appendChild(compile(obj));
	}
}

// internally managed shortcut to document.getElementByID
function dom(name) {
	return domReg[name];
}

// context-unaware deep equal as temp diff algo
function deepEq(a, b) {

	const ta = typeof a;
	const tb = typeof b;

	if (ta !== tb) {
		return false;
	}

	if (ta === "function" && tb === "function") {
		return a.toString() === b.toString();
	}

	if (a === null && b === null) {
		return true;
	}

	if (ta !== "object" && tb !== "object") {
		return a === b;
	}

	const ka = Object.keys(a);
	const kb = Object.keys(b);

	if (ka.length !== kb.length) {
		return false;
	}

	for (const k in a) {
		if (!deepEq(a[k], b[k])) {
			return false;
		}
	}

	return true;

}

return {
	t,
	render,
	redraw,
	dom,
};

};
