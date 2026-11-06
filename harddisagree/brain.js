// Head-to-head brain tests, played privately on each phone with the same seed.
// Each one finishes by reporting a score (higher wins) and a label for the big screen.

const INK = [['RED', '#ff5a36'], ['GREEN', '#1fbf72'], ['BLUE', '#58a6ff'], ['YELLOW', '#ffc23d']];

const BRAIN_GAMES = {
  reaction: {
    title: 'Fast Hands',
    how: 'Wait for green, then tap as fast as you can. Five rounds. Tapping early costs you.',
    run(box, rand, done) {
      const times = [];
      let goAt = 0;
      let timer = null;
      box.innerHTML = '<button class="brain-zone" data-g="tap" id="zone">Wait…</button>';
      const zone = box.querySelector('#zone');
      const arm = () => {
        goAt = 0;
        zone.className = 'brain-zone';
        zone.textContent = 'Wait…';
        timer = setTimeout(() => {
          goAt = performance.now();
          zone.className = 'brain-zone go';
          zone.textContent = 'TAP!';
        }, 1000 + rand() * 2200);
      };
      zone.addEventListener('click', () => {
        clearTimeout(timer);
        times.push(goAt ? performance.now() - goAt : 800);
        if (times.length === 5) {
          const avg = Math.round(times.reduce((a, b) => a + b, 0) / 5);
          done({ score: -avg, label: `${avg} ms average` });
        } else {
          arm();
        }
      });
      arm();
    },
  },

  stroop: {
    title: 'Ink, Not Word',
    how: 'Tap the color of the ink, not the word it spells. Sixteen rounds, as fast as you can.',
    run(box, rand, done) {
      let i = 0;
      let right = 0;
      let answer = '';
      const start = performance.now();
      box.innerHTML = `<div class="brain-word" id="word"></div><div class="brain-grid">${INK.map(([n]) => `<button class="brain-btn" data-g="${n}">${n}</button>`).join('')}</div>`;
      const word = box.querySelector('#word');
      const show = () => {
        const text = INK[Math.floor(rand() * 4)][0];
        const ink = INK[Math.floor(rand() * 4)];
        answer = ink[0];
        word.textContent = text;
        word.style.color = ink[1];
      };
      box.querySelector('.brain-grid').addEventListener('click', (e) => {
        const b = e.target.closest('[data-g]');
        if (!b) return;
        if (b.dataset.g === answer) right++;
        if (++i === 16) {
          const secs = (performance.now() - start) / 1000;
          done({ score: right * 10 - secs, label: `${right}/16 in ${secs.toFixed(1)} seconds` });
        } else {
          show();
        }
      });
      show();
    },
  },

  memory: {
    title: 'Digit Span',
    how: 'Watch the digits, then tap them back in order. It keeps growing until you miss.',
    run(box, rand, done) {
      let length = 3;
      const play = () => {
        const digits = Array.from({ length }, () => Math.floor(rand() * 10));
        box.innerHTML = '<div class="brain-zone" id="zone"></div>';
        const zone = box.querySelector('#zone');
        let at = 0;
        const flash = () => {
          if (at === digits.length) { ask(digits); return; }
          zone.textContent = digits[at++];
          setTimeout(() => {
            zone.textContent = '';
            setTimeout(flash, 180);
          }, 620);
        };
        flash();
      };
      const ask = (digits) => {
        let at = 0;
        box.innerHTML = `<p class="brain-word" id="typed">?</p><div class="brain-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => `<button class="brain-btn" data-g="${n}">${n}</button>`).join('')}</div>`;
        box.querySelector('.brain-pad').addEventListener('click', (e) => {
          const b = e.target.closest('[data-g]');
          if (!b) return;
          if (Number(b.dataset.g) !== digits[at]) {
            const best = length - 1;
            done({ score: best, label: `${best} digits remembered` });
            return;
          }
          at++;
          box.querySelector('#typed').textContent = '•'.repeat(at);
          if (at === digits.length) {
            length++;
            setTimeout(play, 350);
          }
        });
      };
      play();
    },
  },

  gonogo: {
    title: 'Hold Back',
    how: 'Tap on green. Do nothing on red. Most are green, so your thumb will want to go anyway.',
    run(box, rand, done) {
      const stimuli = Array.from({ length: 24 }, () => rand() < 0.72);
      const go = stimuli.filter(Boolean).length;
      let i = -1;
      let hits = 0;
      let slips = 0;
      let tapped = false;
      box.innerHTML = '<button class="brain-zone" data-g="tap" id="zone"></button>';
      const zone = box.querySelector('#zone');
      zone.addEventListener('click', () => {
        if (i < 0 || tapped || !zone.textContent) return;
        tapped = true;
        if (stimuli[i]) hits++;
        else slips++;
        zone.className = 'brain-zone';
        zone.textContent = '';
      });
      const next = () => {
        if (++i === stimuli.length) {
          done({ score: hits - slips * 2, label: `${hits}/${go} hits, ${slips} impulse taps` });
          return;
        }
        tapped = false;
        zone.className = `brain-zone ${stimuli[i] ? 'go' : 'stop'}`;
        zone.textContent = stimuli[i] ? 'GO' : 'STOP';
        setTimeout(() => {
          zone.className = 'brain-zone';
          zone.textContent = '';
          setTimeout(next, 260);
        }, 620);
      };
      next();
    },
  },

  rotate: {
    title: 'Mental Rotation',
    how: 'Is the turned letter a normal R, or a mirror image? Twelve rounds, as fast as you can.',
    run(box, rand, done) {
      let i = 0;
      let right = 0;
      let mirrored = false;
      const start = performance.now();
      box.innerHTML = '<div class="brain-glyph"><span id="glyph">R</span></div><div class="brain-grid" id="pick"><button class="brain-btn" data-g="normal">Normal</button><button class="brain-btn" data-g="mirror">Mirror</button></div>';
      const glyph = box.querySelector('#glyph');
      glyph.style.display = 'inline-block';
      const show = () => {
        mirrored = rand() < 0.5;
        const turn = 40 + Math.floor(rand() * 280);
        glyph.style.transform = `rotate(${turn}deg) scaleX(${mirrored ? -1 : 1})`;
      };
      box.querySelector('#pick').addEventListener('click', (e) => {
        const b = e.target.closest('[data-g]');
        if (!b) return;
        if ((b.dataset.g === 'mirror') === mirrored) right++;
        if (++i === 12) {
          const secs = (performance.now() - start) / 1000;
          done({ score: right * 10 - secs, label: `${right}/12 in ${secs.toFixed(1)} seconds` });
        } else {
          show();
        }
      });
      show();
    },
  },
};

function startBrain(box, game, seed, done) {
  const test = BRAIN_GAMES[game];
  box.innerHTML = `<h2>${test.title}</h2><p class="rule-text">${test.how}</p><button class="next" data-g="start" id="brain-start">I'm ready</button>`;
  box.querySelector('#brain-start').addEventListener('click', () => test.run(box, seededRandom(seed), done));
}
