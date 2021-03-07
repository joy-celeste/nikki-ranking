// Runs on the actual active tab
const now = new Date();
const localStorage = window.localStorage;

function storageSet(key, value) {
	chrome.storage.sync.set({[key]: value}, function() {
		console.log(`[SET] ${key} -> ${value}`);
	});
}

function storageGetMultiple(keys, callback) {
	chrome.storage.sync.get(keys, (result) => {
		console.log(`[GET] ${keys} <- ${result}`);
		callback(result);
	});
}

function storageGet(key, callback) {
	chrome.storage.sync.get([key], (result) => {
		console.log(`[GET] ${key} <- ${result[key]}`);
		callback(result[key]);
	});
}

function fetchData(referrer, body) {
	return {
		"headers": {
			"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
			"accept-language": "en-US,en;q=0.9",
			"sec-fetch-dest": "document",
			"sec-fetch-mode": "navigate",
			"sec-fetch-site": "same-origin",
			"sec-fetch-user": "?1",
			"upgrade-insecure-requests": "1"
		},
		"referrer": referrer ?? `https://ln.nikkis.info/`,
		"referrerPolicy": "strict-origin-when-cross-origin",
		"body": body,
		"method": body ? "POST" : "GET",
		"mode": "cors",
		"credentials": "include"
	}
}

class Table {
	constructor(tableContent) {
		this.tableContent = tableContent;
		this.cache = {}
	};

	getChapterList(stageType) { // 'commission' or 'chapters'
		fetch(`https://ln.nikkis.info/stages/${stageType}/`, fetchData())
		.then(r => r.text())
		.then(result => {
			var parser = new DOMParser();
			var doc = parser.parseFromString(result, 'text/html');
			var nodes = [...doc.querySelectorAll('.pink-text.text-lighten-3')];
			// var chapters = new Set(nodes.map(node => node.href.split("/").pop()));
			var chapters = nodes.map(node => node.href.split("/").pop());
			chapters.forEach((stageString) => {
				let stage = new Stage(stageType, stageString, true, (key, value) => this.addToCache(key, value), this.cache)
				stage.getData((row) => this.tableContent.append(row))
			})
		});
	};

	addToCache(key, value) {
		this.cache[key] = value
	};

	renderTable = async function() {
		storageGetMultiple(['nikki-ranking-last-refresh', 'nikki-ranking'], (result) => {
			const lastRefresh = result['nikki-ranking-last-refresh']
			const cachedResults = result['nikki-ranking']
			console.log("From the cache, we got: ", lastRefresh, cachedResults)

			if (lastRefresh && Object.keys(cachedResults).length !== 0) {
				const lastRefreshedAsDate = new Date(lastRefresh);
				const daysSinceLastRefreshed = (now - lastRefreshedAsDate) / (1000 * 60 * 60 * 24);
				console.log("daysSinceLastRefreshed", daysSinceLastRefreshed)

				if (daysSinceLastRefreshed <= 7) {
					for (let [key, storedValue] of Object.entries(cachedResults)) {
						const stageType = key.substring(0, 7) === 'chapter' ? 'chapters' : 'commission';
						const keySplit = key.split("_");
						const isPrincess = keySplit[1] === 'princess';
						let stageString = keySplit.pop();

						if (keySplit.pop() === 'V2') {
							stageString = `V2_${stageString}`
						}
						let stage = new Stage(stageType, stageString, isPrincess, (key, value) => addToCache(key, value), this.cache)
						stage.addRow((row) => this.tableContent.append(row), storedValue)
					}
					return;
				}
			}
			this.getChapterList('commission');
			this.getChapterList('chapters');
			storageSet('nikki-ranking-last-refresh', now.getTime());
			return;
		})

		storageGet('nikki-ranking-last-refresh', (lastRefresh) => {
			const lastUpdated = document.getElementById('last-updated');
			const lastRefreshedAsDate = new Date(lastRefresh);
			lastUpdated.innerText = `Last updated: ${lastRefreshedAsDate.toLocaleDateString()} ${lastRefreshedAsDate.toLocaleTimeString()}`;
		});
	}
}

class Stage {
  constructor(stageType, stageString, isPrincess, cacheCallback, cache) {
		this.stageType = stageType; // 'commission' or 'chapters'
    	this.stageString = stageString;
		this.chapterType = isPrincess ? 'princess' : 'maiden';
		this.cacheCallback = cacheCallback;
		this.cacheReference = cache;
  }

	get ownScoreParam() {
		const stageType = this.stageType === 'commission' ? 'commission' : 'chapter';
		const chapterType = this.stageType === 'commission' ? 'common' : this.chapterType;
		return [stageType, chapterType, this.stageString].filter((x) => x).join('_');
	}
	
	get topScoreURI() {
		if (this.stageType === 'commission') {
			return `https://ln.nikkis.info/stages/commission/${this.stageString}`
		} else {
			return `https://ln.nikkis.info/stages/chapters/${this.chapterType}/${this.stageString}`
		}
	}

	parseNum(inputString) {
		return parseFloat(inputString.split(',').join(''));
	}

	getNumNewItems(suggestedWardrobe) {
		const filteredSuggestedWardrobe = suggestedWardrobe.filter((item) => !!item.new);
		return filteredSuggestedWardrobe.length;
	}

	getChapterTopScore(callback) {
		fetch(this.topScoreURI, fetchData(`https://ln.nikkis.info/stages/${this.stageType}/`))
		.then(r => r.text())
		.then(result => {
				// Convert the HTML string into a document object
				console.log(`Tried URI: ${this.topScoreURI}`);
				var parser = new DOMParser();
				var doc = parser.parseFromString(result, 'text/html');
				var basescore = doc.querySelector('.basescore').innerText; // "Base score: 128,000"
				var removeString = basescore.split(':')[1] // " 128,000"
				this.maxBaseScore = this.parseNum(removeString.trim()); // " 128,000" -> "128,000" -> 12800
				callback();
		});
	}

	getChapterOwnScore = (callback) => {
		fetch("https://my.nikkis.info/getguide/ln", fetchData(null, `{\"stage\":\"${this.ownScoreParam}\"}`))
		.then(r => r.text())
		.then(result => {
			console.log(`Tried stage: ${this.ownScoreParam}`);
			const initialResult = JSON.parse(result); // {guide: {wardrobe: {...}, score: "128,000"}
			this.newItems = this.getNumNewItems(initialResult.guide.wardrobe);

			const score = initialResult.guide.score; // "128,000"
			const scoreAsNum = this.parseNum(score); // "128,000" -> "128000" -> 128000
			this.ownScore = scoreAsNum;

			const storedValue = {nI: this.newItems, mBS: this.maxBaseScore/1000, oS: this.ownScore/1000}
			this.cacheCallback(this.ownScoreParam, storedValue);
			callback(renderRow(this.createChapterLink(), this.newItems, this.maxBaseScore / 1000, this.ownScore / 1000, now))
			$.bootstrapSortable({ applyLast: true })
		})
		.catch((error) => console.log(`Failed to get own chapter score on ${this.stageParam}: ${error}`));
	}

	createChapterLink = () => {
		const chapterLink = document.createElement('a');
		const chapterLinkText = document.createTextNode(this.ownScoreParam); 
		chapterLink.appendChild(chapterLinkText);  
		chapterLink.title = this.ownScoreParam;
		chapterLink.href = this.topScoreURI;
		return chapterLink;
	}

	getData = (callback) => {
		this.getChapterTopScore(() => this.getChapterOwnScore(callback));
	}

	addRow = (callback, storedValue) => {
		callback(renderRow(this.createChapterLink(), storedValue.nI, storedValue.mBS, storedValue.oS));
		$.bootstrapSortable({ applyLast: true })
	}
}

renderRefreshButton = (ownScoreParam) => {
	const refreshLink = document.createElement('a');
	const refreshLinkEmoji = document.createElement('span');
	refreshLinkEmoji.innerHTML = ' &#x1F504';
	refreshLink.appendChild(refreshLinkEmoji);  
	refreshLink.title = "Refresh";
	refreshLinkEmoji.onClick = () =>clearAllAndRefresh(ownScoreParam);
	refreshLink.onClick = () => clearAllAndRefresh(ownScoreParam);
	return refreshLink;
}

const renderRow = (chapterLink, newItems, maxBaseScore, ownScore) => {
	var tableRow = document.createElement('tr');
	var cell1 = document.createElement('th');
	cell1.scope = "row";
	cell1.appendChild(chapterLink);

	var cell2 = document.createElement('td');
	cell2.innerText = newItems;
	var cell3 = document.createElement('td');
	cell3.innerText = maxBaseScore * 1000;
	var cell4 = document.createElement('td');
	cell4.innerText = ownScore * 1000;
	var cell5 = document.createElement('td');
	cell5.innerText = (maxBaseScore - ownScore) * 1000;

	tableRow.appendChild(cell1);
	tableRow.appendChild(cell2);
	tableRow.appendChild(cell3);
	tableRow.appendChild(cell4);
	tableRow.appendChild(cell5);
	return tableRow;
}

function timeSince(date) {
	var seconds = Math.floor((new Date() - date) / 1000);
	var interval = seconds / 31536000;
	if (interval > 1) {
	  return Math.floor(interval) + " years ago";
	}
	interval = seconds / 2592000;
	if (interval > 1) {
	  return Math.floor(interval) + " months ago";
	}
	interval = seconds / 86400;
	if (interval > 1) {
	  return Math.floor(interval) + " days ago";
	}
	interval = seconds / 3600;
	if (interval > 1) {
	  return Math.floor(interval) + " hours ago";
	}
	interval = seconds / 60;
	if (interval > 1) {
	  return Math.floor(interval) + " minutes ago";
	}
	return Math.floor(seconds) + " seconds ago";
}

tableContent = document.getElementById('tableContent');
const table = new Table(tableContent);
table.renderTable();
storageSet('nikki-ranking', table.cache);