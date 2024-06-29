const subtool = {
	init: function () {
		if (!this.roomListener) return;

		this.bgmSettings = this.options.music;

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
