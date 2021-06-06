window.ui = (() => {

const domReg = {};

// comp def shortcut
function t(tag, props, children) {
	return {
		tag,
		props,
		children,
	};
}

// compile a comp to dom element and resolve dynamic content
function compile(obj) {

	// TODO: support shortcut for #id
	const segs = obj.tag.split(".");
	const el = document.createElement(segs[0] || "div");
	const className = segs[1] ? segs.splice(1).join(" ") : "";

	el._cleanUps = [];

	if (className) {
		el.className = className;
	}

	function setProp(k, v) {
		if (k === "classes") {
			el.className = v.join(" ");
			if (className) {
				el.className += " " + className;
			}
		} else if (k === "styles") {
			for (const s in v) {
				el.style[s] = v[s];
			}
		} else if (k === "dom") {
			domReg[v] = el;
			el._cleanUps.push(() => {
				delete domReg[v];
			});
		} else {
			el[k] = v;
		}
	}

	for (const key in obj.props) {

		const val = obj.props[key];

		if (val == null) {
			continue;
		}

		if (val._isState) {
			setProp(key, val.get());
			el._cleanUps.push(val.sub((data) => {
				setProp(key, data);
			}));
		} else {
			// static prop
			setProp(key, val);
		}

	}

	if (obj.children != null) {

		function setChildren(children) {
			const ty = typeof children;
			if (Array.isArray(children)) {
				while (el.firstChild) {
					for (const cleanUp of el.firstChild._cleanUps) {
						cleanUp();
					}
					el.removeChild(el.firstChild);
				}
				for (const child of children) {
					if (child) {
						render(el, child);
					}
				}
			} else if (ty === "string" || ty === "number") {
				el.textContent = children;
			} else {
				throw new Error(`invalid children type: ${ty}`);
			}
		}

		if (obj.children._isState) {
			setChildren(obj.children.get());
			el._cleanUps.push(obj.children.sub((data) => {
				setChildren(data);
			}));
		} else {
			// static children
			setChildren(obj.children);
		}

	}

	return el;

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

// internally managed shortcut to document.getElementByID
function dom(name) {
	return domReg[name];
}

function state(data) {

	const ty = typeof data;
	const subs = {};
	let lastSubID = 0;

	return {
		_isState: true,
		set(val) {
			const ty2 = typeof val;
			switch (ty2) {
				case "function":
					this.set(val(data));
					break;
				case ty:
					data = val;
					this.pub();
					break;
				default:
					throw new Error(`expected ${ty}, found ${ty2}`);
			}
		},
		get() {
			return data;
		},
		sub(cb) {
			const id = lastSubID++;
			subs[id] = cb;
			return () => {
				delete subs[id];
			};
		},
		pub() {
			for (const id in subs) {
				subs[id](data);
			}
		},
		map(f) {
			const state2 = state(f(data));
			this.sub((data2) => {
				state2.set(f(data2));
			});
			return state2;
		},
		every(f) {
			return this.map((data2) => data2.map(f));
		},
	};
}

return {
	t,
	render,
	dom,
	state,
};

})();
