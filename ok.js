window.ok = (() => {

const domReg = {};

// comp def shortcut
function t(tag, props, children) {
	return {
		tag,
		props,
		children,
	};
}

// compile a vdom to dom and resolve reactive content
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

// render a vdom to dom
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

// reactive state
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

// compile sass-like js obj def to css string
function compileCSS(list) {

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

// add css to document
function css(list) {
	const el = document.createElement("style");
	el.textContent = compileCSS(list);
	document.head.appendChild(el);
}

// deep nesting obj proxy with set handler
function deepProxy(data, handler) {

	return new Proxy(data, {

		get(obj, key) {

			function setter(obj2, key2, val2) {
				obj2[key2] = val2;
				handler(obj);
				return true;
			}

			function getter(obj2, key2) {
				const val = obj2[key2];
				if (typeof val === "object" && val !== null) {
					return new Proxy(val, {
						get: getter,
						set: setter,
					});
				} else {
					return val;
				}
			}

			return getter(obj, key);

		},

		set(obj, key, val) {
			obj[key] = val;
			handler(obj);
			return true;
		},

	});

}

// hook deepProxy with storage-like JSON string container
function storageProxy(host) {
	return (name, initData) => {
		if (!host[name]) {
			host[name] = JSON.stringify(initData);
		}
		return deepProxy(JSON.parse(host[name]), (obj) => {
			host[name] = JSON.stringify(obj);
		});
	};
}

const lstore = storageProxy(window.localStorage);
const sstore = storageProxy(window.sessionStorage);

// url hash helper
function hash(initData) {
	if (!window.location.hash) {
		window.location.hash = initData;
	}
	let isNum = typeof initData === "number";
	return {
		get() {
			const hash = window.location.hash.substring(1);
			if (isNum) {
				return Number(hash);
			} else {
				return hash;
			}
		},
		set(val) {
			window.location.hash = val;
			isNum = typeof val === "number";
		},
	};
}

// url params helper
function params() {
	// TODO
}

return {
	t,
	render,
	dom,
	state,
	css,
	lstore,
	sstore,
	hash,
};

})();
