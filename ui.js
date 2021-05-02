window.ui = () => {

let handlers = [];
const domReg = {};

function t(tag, props, children) {
	return {
		tag,
		props,
		children,
	};
}

// TODO: support id
function compile(obj) {

	const segs = obj.tag.split(".");
	const el = document.createElement(segs[0] || "div");
	const className = segs[1] ? segs.splice(1).join(" ") : "";

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
		} else if (k === "dom") {
			domReg[v] = el;
		} else {
			el[k] = v;
		}
	}

	for (const key in obj.props) {
		const val = obj.props[key];
		if (key.startsWith("on") && typeof val === "function") {
			el.addEventListener(key.substring(2), (e) => {
				const res = val.call(el, e);
				if (res !== false) {
					redraw();
				}
			});
		} else {
			if (typeof val === "function") {
				const makeVal = val.bind(el);
				handlers.push({
					el: el,
					cb: () => setProp(key, makeVal()),
				});
				setProp(key, makeVal());
			} else {
				setProp(key, val);
			}
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
		} else if (children !== undefined) {
			el.textContent = children;
		}
	}

	if (typeof obj.children === "function") {

		const makeChildren = obj.children.bind(el);
		let prevChildren = makeChildren();

		handlers.push({
			el: el,
			cb: () => {
				const children = makeChildren();
				// TODO: more sophisticated diff
				if (!deepEq(children, prevChildren)) {
					setChildren(children);
				}
				prevChildren = children;
			},
		});

		setChildren(prevChildren);

	} else {
		setChildren(obj.children);
	}

	return el;

}

function cleanup(el) {
	[...el.children].forEach(cleanup);
	handlers = handlers.filter((h) => h.el !== el);
}

function render(root, obj) {
	if (Array.isArray(obj)) {
		for (const c of obj) {
			render(root, c);
		}
	} else {
		root.appendChild(compile(obj));
	}
}

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

function redraw() {
	for (const handler of handlers) {
		handler.cb();
	}
}

function dom(name) {
	return domReg[name];
}

return {
	t,
	render,
	redraw,
	dom,
};

};
