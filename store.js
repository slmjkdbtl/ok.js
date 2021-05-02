window.store = (() => {

function make(host) {

	return (name, initData) => {

		if (!host[name]) {
			host[name] = JSON.stringify(initData);
		}

		return new Proxy(JSON.parse(host[name]), {

			get(obj, key) {

				function setter(obj2, key2, val2) {
					obj2[key2] = val2;
					host[name] = JSON.stringify(obj);
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
				host[name] = JSON.stringify(obj);
				return true;
			},

		});

	};

}

const local = make(window.localStorage);
const session = make(window.sessionStorage);

return {
	local,
	session,
	make,
};

})();
