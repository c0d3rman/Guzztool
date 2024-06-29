const subtool = {
	init: function () {
		if (!this.roomListener) return;

		// TBD: get music settings from content script
		this.bgmSettings = {
			"basic": [
				{
					bgmUrl: 'audio/dpp-trainer.mp3',
					bgmStart: 13440,
					bgmEnd: 96959,
				},
				{
					bgmUrl: 'audio/dpp-rival.mp3',
					bgmStart: 13888,
					bgmEnd: 66352,
				},
				{
					bgmUrl: 'audio/hgss-johto-trainer.mp3',
					bgmStart: 23731,
					bgmEnd: 125086,
				},
				{
					bgmUrl: 'audio/hgss-kanto-trainer.mp3',
					bgmStart: 13003,
					bgmEnd: 94656,
				},
				{
					bgmUrl: 'audio/bw-trainer.mp3',
					bgmStart: 14629,
					bgmEnd: 110109,
				},
				{
					bgmUrl: 'audio/bw-rival.mp3',
					bgmStart: 19180,
					bgmEnd: 57373,
				},
				{
					bgmUrl: 'audio/bw-subway-trainer.mp3',
					bgmStart: 15503,
					bgmEnd: 110984,
				},
				{
					bgmUrl: 'audio/bw2-kanto-gym-leader.mp3',
					bgmStart: 14626,
					bgmEnd: 58986,
				},
				{
					bgmUrl: 'audio/bw2-rival.mp3',
					bgmStart: 7152,
					bgmEnd: 68708,
				},
				{
					bgmUrl: 'audio/xy-trainer.mp3',
					bgmStart: 7802,
					bgmEnd: 82469,
				},
				{
					bgmUrl: 'audio/xy-rival.mp3',
					bgmStart: 7802,
					bgmEnd: 58634,
				},
				{
					bgmUrl: 'audio/oras-trainer.mp3',
					bgmStart: 13579,
					bgmEnd: 91548,
				},
				{
					bgmUrl: 'audio/oras-rival.mp3',
					bgmStart: 14303,
					bgmEnd: 69149,
				},
				{
					bgmUrl: 'audio/sm-trainer.mp3',
					bgmStart: 8323,
					bgmEnd: 89230,
				},
				{
					bgmUrl: 'audio/sm-rival.mp3',
					bgmStart: 11389,
					bgmEnd: 62158,
				},
			],
			"normal": [
				{ // Default
					bgmUrl: "https://play.pokemonshowdown.com/audio/sm-trainer.mp3",
					bgmStart: 8323,
					bgmEnd: 89230,
				},
				{
					bgmUrl: 'https://github.com/OpenSauce04/ssmm-showdown/raw/master/music/xy-elite4.mp3',
					bgmStart: 133673,
					bgmEnd: 261675,
				},
				{
					bgmUrl: 'https://github.com/OpenSauce04/ssmm-showdown/raw/master/music/bw-n-final.mp3',
					bgmStart: 42532,
					bgmEnd: 129714,
				},
				{
					bgmUrl: 'https://github.com/OpenSauce04/ssmm-showdown/raw/master/music/bdsp-giratina.mp3',
					bgmStart: 60527,
					bgmEnd: 164162,
				},
				{
					bgmUrl: 'https://github.com/OpenSauce04/ssmm-showdown/raw/master/music/b2w2-plasma.mp3',
					bgmStart: 264410,
					bgmEnd: 438982,
				},
				{
					bgmUrl: 'https://github.com/OpenSauce04/ssmm-showdown/raw/master/music/bdsp-galactic-admin.mp3',
					bgmStart: 119450,
					bgmEnd: 176991,
				},
			],
			"special": {
				"dogars": {
					// If your mon is a Koffing named "dogars"
					bgmUrl: 'https://play.pokemonshowdown.com/audio/bw2-homika-dogars.mp3',
					bgmStart: 1661,
					bgmEnd: 68131,
				},
				"ludicolo-lombre": {
					// If there's at least two mons from the Ludicolo line in team preview
					bgmUrl: 'https://play.pokemonshowdown.com/audio/xd-miror-b.mp3',
					bgmStart: 9000,
					bgmEnd: 57815,
				},
				"ludicolo": {
					// If there's at least two Ludicolos in team preview
					bgmUrl: 'https://play.pokemonshowdown.com/audio/colosseum-miror-b.mp3',
					bgmStart: 896,
					bgmEnd: 47462,
				},
				"spl": {
					// If you're in an SPL game
					bgmUrl: "https://play.pokemonshowdown.com/audio/spl-elite4.mp3",
					bgmStart: 3962,
					bgmEnd: 152509,
				},
			}
		};

		this.intercept(window.BattleScene, "setBgm", this.setBgm);
		this.intercept(window.BattleScene, "rollBgm", this.rollBgm);
		this.intercept(window.BattleSound, "getSound", this.getSound);
	},

	intercept(obj, methodName, callback) {
		const self = this;
		const prototype = obj.prototype ?? obj.__proto__;
		const originalMethod = prototype[methodName];
		prototype[methodName] = function (...origArgs) {
			try {
				return callback.call(this, self, (...args) => originalMethod.apply(this, args), ...origArgs);
			} catch (e) {
				self.log.error(e);
				throw e;
			}
		};
	},

	setBgm(self, originalMethod, bgmNum) {
		try {
			if (this.bgmNum === bgmNum) return;
			this.bgmNum = bgmNum;
			self.log.info(`Setting bgm to ${bgmNum}`);

			const load = (bgm) => { this.bgm = BattleSound.loadBgm(bgm.bgmUrl, bgm.bgmStart, bgm.bgmEnd, this.bgm) };

			if (bgmNum == -1 && "dogars" in self.bgmSettings.special) {
				load(self.bgmSettings.special["dogars"]);
			} else if (bgmNum == -2 && "ludicolo-lombre" in self.bgmSettings.special) {
				load(self.bgmSettings.special["ludicolo-lombre"]);
			} else if (bgmNum == -3 && "ludicolo" in self.bgmSettings.special) {
				load(self.bgmSettings.special["ludicolo"]);
			} else if (bgmNum == -101 && "spl" in self.bgmSettings.special) {
				load(self.bgmSettings.special["spl"]);
			}
			else if (bgmNum > 0 && bgmNum < self.bgmSettings.normal.length) {
				load(self.bgmSettings.normal[bgmNum - 1]);
			}
			else {
				load(self.bgmSettings.normal[0]);
			}

			this.updateBgm();
		} catch (e) {
			self.log.error(e);
			throw e;
		}
	},

	rollBgm(self, originalMethod) {
		this.setBgm(1 + this.numericId % self.bgmSettings.normal.length);
	},

	getSound(self, originalMethod, url) {
		const sound = originalMethod(url);
		if (!sound) return;
		if (self.isValidUrl(url)) {
			sound.src = url;
		}
		return sound;
	},

	isValidUrl(string) {
		try {
			new URL(string);
			return true;
		} catch (_) {
			return false;
		}
	}
};

export default subtool;
