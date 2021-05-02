window.store = (() => {

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

const local = storageProxy(window.localStorage);
const session = storageProxy(window.sessionStorage);

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

function params() {
	// TODO
}

return {
	local,
	session,
	hash,
	params,
};

})();
