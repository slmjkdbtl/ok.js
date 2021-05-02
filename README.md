some helper functions for the browser

```js
const { t, render, } = ui();
let counter = 0;

render(document.body, [
	t("div", {}, () => counter),
	t("button", {
		onclick() {
			counter++;
		},
	}, "add"),
]);
```
