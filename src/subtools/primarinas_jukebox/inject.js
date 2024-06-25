const subtool = {
	init: function () {
		if (!this.roomListener) return;

		this.intercept(window.BattleScene, "setBgm", this.setBgm);
		// this.intercept(window.BattleScene, "rollBgm", this.rollBgm);
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

			switch (bgmNum) {
				case -1:
					this.bgm = BattleSound.loadBgm('https://play.pokemonshowdown.com/audio/bw2-homika-dogars.mp3', 1661, 68131, this.bgm);
					break;
				case -2:
					this.bgm = BattleSound.loadBgm('https://play.pokemonshowdown.com/audio/xd-miror-b.mp3', 9000, 57815, this.bgm);
					break;
				case -3:
					this.bgm = BattleSound.loadBgm('https://play.pokemonshowdown.com/audio/colosseum-miror-b.mp3', 896, 47462, this.bgm);
					break;
				case -101:
					this.bgm = BattleSound.loadBgm('https://play.pokemonshowdown.com/audio/spl-elite4.mp3', 3962, 152509, this.bgm);
					break;

				case 1:
					this.bgm = BattleSound.loadBgm('https://github.com/OpenSauce04/ssmm-showdown/raw/master/music/xy-elite4.mp3', 133673, 261675, this.bgm);
					break;
				case 2:
					this.bgm = BattleSound.loadBgm('https://github.com/OpenSauce04/ssmm-showdown/raw/master/music/bw-n-final.mp3', 42532, 129714, this.bgm);
					break;
				case 3:
					this.bgm = BattleSound.loadBgm('https://github.com/OpenSauce04/ssmm-showdown/raw/master/music/bdsp-giratina.mp3', 60527, 164162, this.bgm);
					break;
				case 4:
					this.bgm = BattleSound.loadBgm('https://github.com/OpenSauce04/ssmm-showdown/raw/master/music/b2w2-plasma.mp3', 264410, 438982, this.bgm);
					break;
				case 5:
					this.bgm = BattleSound.loadBgm('https://github.com/OpenSauce04/ssmm-showdown/raw/master/music/bdsp-galactic-admin.mp3', 119450, 176991, this.bgm);
					break;

				case 6:
				default:
					this.bgm = BattleSound.loadBgm('https://play.pokemonshowdown.com/audio/sm-trainer.mp3', 8323, 89230, this.bgm);
					break;
			}

			this.updateBgm();
		} catch (e) {
			self.log.error(e);
			throw e;
		}
	},

	rollBgm(self, originalMethod) {
		this.setBgm(1 + this.numericId % 2);
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
