export function load(key, defaultValue) {
	let v = localStorage.getItem(key);
	if(v) {
		return JSON.parse(v);
	} else {
		return defaultValue;
	}
}

export function save(key, value){
	localStorage.setItem(key, JSON.stringify(value));		
}