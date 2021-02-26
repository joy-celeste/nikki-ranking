// Runs on the actual active tab
const now = new Date();
const localStorage = window.localStorage;

function storageSet(key, value) {
	chrome.storage.sync.set({[key]: value}, function() {
		console.log(`[SET] ${key} -> ${value}`);
	});
}

function storageGet(key, callback) {
	chrome.storage.sync.get([key], (result) => {
		console.log(`[GET] ${key} <- ${result[key]}`);
		callback(result[key]);
	});
}

function storageGetMultiple(keys, callback) {
	chrome.storage.sync.get(keys, (result) => {
		console.log(`[GET] ${keys} <- ${result}`);
		callback(result);
	});
}

class Chapter {
  constructor(volume, chapter, stage, isPrincess=true, isCommission=false) {
		this.volume = volume;
    	this.chapter = chapter;
		this.stage = stage;
		this.isPrincess = isPrincess;
		this.isCommission = isCommission;
  }

	get ownScoreParam() {
		const stageOrComm = this.isCommission ? 'commission' : 'chapter';
		const stageType = this.isCommission ? 'common' : this.isPrincess ? 'princess' : 'maiden';
		const volume = this.volume === 2 ? 'V2' : '';
		const chapterStage = `${this.chapter}-${this.stage}`;
		return [stageOrComm, stageType, volume, chapterStage].filter((x) => x).join('_');
	}
	
	get topScoreURI() {
		const stageOrComm = this.isCommission ? 'commission' : 'chapters';
		const stageType = this.isPrincess ? 'princess' : 'maiden';
		const v2 = this.volume === 2 ? 'V2_' : '';
		const chapterStage = `${v2}${this.chapter}-${this.stage}`;

		if (this.isCommission) {
			return `https://ln.nikkis.info/stages/${stageOrComm}/${chapterStage}`
		} else {
			return `https://ln.nikkis.info/stages/${stageOrComm}/${stageType}/${chapterStage}`
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
		const stageOrComm = this.isCommission ? 'commission' : 'chapters';
		fetch(this.topScoreURI, {
			"headers": {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
				"accept-language": "en-US,en;q=0.9",
				"sec-fetch-dest": "document",
				"sec-fetch-mode": "navigate",
				"sec-fetch-site": "same-origin",
				"sec-fetch-user": "?1",
				"upgrade-insecure-requests": "1"
			},
			"referrer": `https://ln.nikkis.info/stages/${stageOrComm}/`,
			"referrerPolicy": "strict-origin-when-cross-origin",
			"body": null,
			"method": "GET",
			"mode": "cors",
			"credentials": "include"
		})
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

	getChapterExpertScore = (callback) => {
		fetch("https://my.nikkis.info/expertguide/ln", {
			"headers": {
				"accept": "application/json, text/javascript, */*; q=0.01",
				"accept-language": "en-US,en;q=0.9",
				"content-type": "application/json; charset=UTF-8",
				"sec-fetch-dest": "empty",
				"sec-fetch-mode": "cors",
				"sec-fetch-site": "same-site"
			},
			"referrer": "https://beta.nikkis.info/",
			"referrerPolicy": "strict-origin-when-cross-origin",
			"body": `{\"stage\":\"${this.ownScoreParam}\",\"setting\":\"custom\"}`,
			"method": "POST",
			"mode": "cors",
			"credentials": "include"
		})
		.then(r => r.text())
		.then(result => {
			console.log(`Tried stage (expert): ${this.ownScoreParam}`);
			const initialResult = JSON.parse(result); // {guide: {wardrobe: {...}, score: "128,000"}
			this.newExpertItems = this.getNumNewItems(initialResult.guide.wardrobe);
			const score = initialResult.guide.score; // "128,000"
			const scoreAsNum = this.parseNum(score); // "128,000" -> "128000" -> 128000
			this.ownExpertScore = scoreAsNum;
			console.log("newExpertItems", this.newExpertItems, "ownExpertScore", this.ownExpertScore)
		})
		.catch((error) => console.log(`Failed to get expert chapter score on ${this.stageParam}: ${error}`));
	}

	getChapterOwnScore = (callback) => {
		fetch("https://my.nikkis.info/getguide/ln", {
			"headers": {
					"accept": "application/json, text/javascript, */*; q=0.01",
					"accept-language": "en-US,en;q=0.9",
					"content-type": "application/json; charset=UTF-8",
					"sec-fetch-dest": "empty",
					"sec-fetch-mode": "cors",
					"sec-fetch-site": "same-site"
			},
			"referrer": "https://ln.nikkis.info/",
			"referrerPolicy": "strict-origin-when-cross-origin",
			"body": `{\"stage\":\"${this.ownScoreParam}\"}`,
			"method": "POST",
			"mode": "cors",
			"credentials": "include"
		})
		.then(r => r.text())
		.then(result => {
			console.log(`Tried stage: ${this.ownScoreParam}`);
			const initialResult = JSON.parse(result); // {guide: {wardrobe: {...}, score: "128,000"}
			this.newItems = this.getNumNewItems(initialResult.guide.wardrobe);
			const score = initialResult.guide.score; // "128,000"
			const scoreAsNum = this.parseNum(score); // "128,000" -> "128000" -> 128000
			this.ownScore = scoreAsNum;
			
			storageSet(`${this.ownScoreParam}_newItems`, this.newItems);
			storageSet(`${this.ownScoreParam}_maxBaseScore`, this.maxBaseScore);
			storageSet(`${this.ownScoreParam}_ownScore`, this.ownScore);
			storageSet(`${this.ownScoreParam}_lastRefreshed`, now.toString());
			callback(renderRow(this.createChapterLink(), this.newItems, this.maxBaseScore, this.ownScore, now))
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
		// getChapterExpertScore(callBack);
	}

	addRow = (callback) => {
		storageGet(`${this.ownScoreParam}_lastRefreshed`, (lastRefreshed) => {
			if (lastRefreshed) {
				const lastRefreshedAsDate = Date.parse(lastRefreshed);
				const daysSinceLastRefreshed = (now - lastRefreshedAsDate) / (1000 * 60 * 60 * 24);
				if (daysSinceLastRefreshed <= 5) {
					console.log("I am inside here")
					const newItemsKey = `${this.ownScoreParam}_newItems`;
					const maxBaseScoreKey = `${this.ownScoreParam}_maxBaseScore`;
					const ownScoreKey = `${this.ownScoreParam}_ownScore`;
					return storageGetMultiple([newItemsKey, maxBaseScoreKey, ownScoreKey],
						(result) => {
							callback(renderRow(this.createChapterLink(), result[newItemsKey], result[maxBaseScoreKey], result[ownScoreKey], lastRefreshedAsDate));
							$.bootstrapSortable({ applyLast: true })
						});
				}
			}
			this.getData(callback);
		});
	}
}

const renderRow = (chapterLink, newItems, maxBaseScore, ownScore, lastUpdated) => {
	var tableRow = document.createElement('tr');
	var cell1 = document.createElement('th');
	cell1.scope = "row";
	cell1.appendChild(chapterLink);

	var cell2 = document.createElement('td');
	cell2.innerText = newItems;
	var cell3 = document.createElement('td');
	cell3.innerText = maxBaseScore;
	var cell4 = document.createElement('td');
	cell4.innerText = ownScore;
	var cell5 = document.createElement('td');
	cell5.innerText = maxBaseScore - ownScore;
	var cell6 = document.createElement('td');
	cell6.innerText = timeSince(lastUpdated);

	tableRow.appendChild(cell1);
	tableRow.appendChild(cell2);
	tableRow.appendChild(cell3);
	tableRow.appendChild(cell4);
	tableRow.appendChild(cell5);
	tableRow.appendChild(cell6);
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

function renderTable() {
	const tableContent = document.getElementById('tableContent');

	// const chPV2_6 = new Chapter(2, 4, 1, true, false);
	// chPV2_6.getData((row) => tableContent.append(row));

	const chPV1_23 = new Chapter(1, 2, 3, true, false);
	chPV1_23.addRow((row) => tableContent.append(row));

	const maidenV263 = new Chapter(2, 6, 6, false, false);
	maidenV263.addRow((row) => tableContent.append(row));

	const commission = new Chapter(1, 14, 3, true, true);
	commission.addRow((row) => tableContent.append(row));

	// render columns
	// for (var i = 0; i < columns.length; i++) {
	// 	var column = document.createElement('div');
	// 	column.className = 'column';
	// 	column.style.width = (1 / columns.length) * 100 + '%';
	// }
}
renderTable();
