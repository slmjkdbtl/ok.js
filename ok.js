// TODO: css in js solution

window.ok = (() => {

const context = []

function signal(value) {

	const subs = new Set()

	const read = () => {
		const running = context[context.length - 1]
		if (running) {
			subs.add(running)
			running.deps.add(subs)
		}
		return value
	}

	const write = (nextValue) => {
		value = typeof nextValue === "function"
			? nextValue(value)
			: nextValue
		for (const sub of [...subs]) {
			sub.execute()
		}
	}

	return [read, write]

}

function effect(fn) {

	const cleanup = () => {
		for (const dep of running.deps) {
			dep.delete(running)
		}
		running.deps.clear()
	}

	const execute = () => {
		cleanup()
		context.push(running)
		try {
			fn()
		} finally {
			context.pop()
		}
	}

	const running = {
		execute: execute,
		deps: new Set(),
	}

	execute()

	return cleanup

}

// comp def shortcut
function h(tag, props, children) {
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

	function setProp(k, v) {
		if (k.toLowerCase() === "oncleanup") {
			cleanups.push(v)
		} else if (k === "classes") {
			el.className = className
			const names = v.filter(c => c).join(" ")
			if (names) {
				el.className += " " + names
			}
		} else if (k === "styles") {
			for (const s in v) {
				el.style.setProperty(s, v[s])
			}
		} else {
			el[k] = v
		}
	}

	for (const key in obj.props) {

		const val = obj.props[key]

		if (val == null) {
			continue
		}

		if (!key.startsWith("on") && typeof val === "function") {
			cleanups.push(effect(() => setProp(key, val())))
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
				[...el.children].forEach((c) => c.remove())
				for (const child of children) {
					if (child) {
						el.append(compileEl(child))
					}
				}
			} else {
				el.textContent = children
			}
		}

		// TODO: accept one children is signal
		if (typeof obj.children === "function") {
			cleanups.push(effect(() => setChildren(obj.children())))
		} else {
			// static children
			setChildren(obj.children)
		}

	}

	el._cleanup = () => {
		[...el.children].forEach((c) => c._cleanup())
		cleanups.forEach((cb) => cb())
	}

	return el

}

// render a vdom to dom
function render(root, obj) {
	if (Array.isArray(obj)) {
		obj.forEach((o) => render(root, o))
	} else {
		root.append(compileEl(obj))
	}
}

new MutationObserver((events) => {
	events.forEach((e) => {
		if (e.type !== "childList") {
			return
		}
		for (const node of e.removedNodes) {
			if (node._cleanup) {
				node._cleanup()
			}
		}
	})
}).observe(document.body, { childList: true, subtree: true })

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
	signal,
	effect,
	h,
	render,
	css,
	lstore,
	sstore,
	hash,
	params,
	uid,
}

})()
