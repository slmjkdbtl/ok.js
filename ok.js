// wengwengweng

window.ok = (() => {

const domReg = {}

// comp def shortcut
function t(tag, props, children) {
	return {
		tag,
		props,
		children,
	}
}

function parseTag(tag) {

	const parts = tag
		.split(/([#\.][^#\.]+)/)
		.filter((c) => c.length > 0)

	const info = {
		el: "div",
		id: null,
		classes: [],
	}

	parts.forEach((p, i) => {
		if (p.startsWith("#")) {
			if (info.id) {
				throw new Error(`duplicate id: ${p}`)
			}
			info.id = p.substring(1)
		} else if (p.startsWith(".")) {
			info.classes.push(p.substring(1))
		} else {
			if (i === 0) {
				info.el = p
			}
		}
	})

	return info

}

// compile a vdom to dom and resolve reactive content
function compileEl(obj) {

	const info = parseTag(obj.tag)
	const el = document.createElement(info.el)
	const className = info.classes.join(" ")

	if (info.id) {
		el.id = info.id
	}

	if (className) {
		el.className = className
	}

	const cleanups = []

	el._cleanup = () => {
		[...el.children].forEach((c) => c._cleanup())
		cleanups.forEach((cb) => cb())
	}

	el._destroy = () => {
		el._cleanup()
		el.remove()
	}

	function setProp(k, v) {
		if (k === "classes") {
			el.className = className
			const names = v.filter(c => c).join(" ")
			if (names) {
				el.className += " " + names
			}
		} else if (k === "styles") {
			for (const s in v) {
				el.style.setProperty(s, v[s])
			}
		} else if (k === "dom") {
			domReg[v] = el
			cleanups.push(() => {
				delete domReg[v]
			})
		} else {
			el[k] = v
		}
	}

	for (const key in obj.props) {

		const val = obj.props[key]

		if (val == null) {
			continue
		}

		if (val._isState) {
			setProp(key, val.get())
			cleanups.push(val.sub((data) => {
				setProp(key, data)
			}))
		} else {
			// static prop
			setProp(key, val)
		}

	}

	if (obj.children != null) {

		function setChildren(children) {
			const ty = typeof children
			if (Array.isArray(children)) {
				// TODO: list diff
				[...el.children].forEach((c) => c._destroy())
				for (const child of children) {
					if (child) {
						render(el, child)
					}
				}
			} else {
				el.textContent = children
			}
		}

		if (obj.children._isState) {
			setChildren(obj.children.get())
			cleanups.push(obj.children.sub((data) => {
				setChildren(data)
			}))
		} else {
			// static children
			setChildren(obj.children)
		}

	}

	return el

}

// render a vdom to dom
function render(root, obj) {
	if (Array.isArray(obj)) {
		const cleanups = obj.map((o) => render(root, o))
		return () => cleanups.forEach((cb) => cb())
	} else {
		const el = compileEl(obj)
		root.append(el)
		return () => el._destroy()
	}
}

// internally managed shortcut to document.getElementByID
function dom(name) {
	return domReg[name]
}

// reactive state
function state(data) {

	const subs = {}
	let lastSubID = 0

	return {
		_isState: true,
		set(val) {
			if (typeof val === "function") {
				this.set(val(data))
				return
			}
			data = val
			this.pub()
		},
		get() {
			return data
		},
		sub(cb) {
			const id = lastSubID++
			subs[id] = cb
			return () => {
				delete subs[id]
			}
		},
		pub() {
			for (const id in subs) {
				subs[id](data)
			}
		},
		map(f) {
			return map(this, f)
		},
		every(f) {
			if (!Array.isArray(data)) {
				throw new Error(`every() only exists on arrays, found ${typeof data}`)
			}
			return this.map((data2) => data2.map(f))
		},
	}

}

function map(deps, action) {
	if (!Array.isArray(deps)) return map([deps], action)
	const getValue = () => action(...deps.map((dep) => dep.get()))
	const state2 = state(getValue())
	for (const dep of deps) {
		// TODO: clean up when state2 isn't around
		dep.sub((data) => {
			state2.set(getValue())
		})
	}
	return state2
}

// compile sass-like js obj def to css string
function compileCSS(list) {

	let code = ""

	function handleSheet(s) {
		let t = "{"
		for (const k in s) {
			t += `${k}:${s[k]};`
		}
		t += "}"
		return t
	}

	function handleSheetEx(sel, sheet) {
		let t = sel + " {"
		let post = ""
		for (const key in sheet) {
			const val = sheet[key]
			// media
			if (key === "@media") {
				for (const cond in val) {
					post += `@media ${cond} {${sel}${handleSheet(val[cond])}}`
				}
			// pseudo class
			} else if (key[0] === ":") {
				post += handleSheetEx(sel + key, val)
			// self
			} else if (key[0] === "&") {
				post += handleSheetEx(sel + key.substring(1), val)
			// nesting child
			} else if (typeof(val) === "object") {
				post += handleSheetEx(sel + " " + key, val)
			} else {
				t += `${key}:${val};`
			}
		}
		t += "}" + post
		return t
	}

	for (const sel in list) {
		const sheet = list[sel]
		if (sel === "@keyframes") {
			for (const name in sheet) {
				const map = sheet[name]
				code += `@keyframes ${name} {`
				for (const time in map) {
					code += time + handleSheet(map[time])
				}
				code += "}"
			}
		} else {
			code += handleSheetEx(sel, sheet)
		}
	}

	return code

}

// add css to document
function css(list) {
	const el = document.createElement("style")
	el.textContent = compileCSS(list)
	document.head.append(el)
}

// deep nesting obj proxy with set handler
function deepProxy(data, handler) {

	return new Proxy(data, {

		get(obj, key) {

			function setter(obj2, key2, val2) {
				obj2[key2] = val2
				handler(obj)
				return true
			}

			function getter(obj2, key2) {
				const val = obj2[key2]
				if (typeof val === "object" && val !== null) {
					return new Proxy(val, {
						get: getter,
						set: setter,
					})
				} else {
					return val
				}
			}

			return getter(obj, key)

		},

		set(obj, key, val) {
			obj[key] = val
			handler(obj)
			return true
		},

	})

}

// hook deepProxy with storage-like JSON string container
function storageProxy(host) {
	return (name, initData) => {
		if (!host[name]) {
			host[name] = JSON.stringify(initData)
		}
		return deepProxy(JSON.parse(host[name]), (obj) => {
			host[name] = JSON.stringify(obj)
		})
	}
}

const lstore = storageProxy(window.localStorage)
const sstore = storageProxy(window.sessionStorage)

// url hash helper
function hash(initData) {
	if (!window.location.hash) {
		window.location.hash = initData
	}
	let isNum = typeof initData === "number"
	return {
		get() {
			const hash = window.location.hash.substring(1)
			if (isNum) {
				return Number(hash)
			} else {
				return hash
			}
		},
		set(val) {
			window.location.hash = val
			isNum = typeof val === "number"
		},
	}
}

// url params helper
function params() {
	// TODO
}

const uid = (() => {
	let id = 0
	return () => id++
})()

return {
	t,
	render,
	dom,
	state,
	map,
	css,
	lstore,
	sstore,
	hash,
	params,
	uid,
}

})()
