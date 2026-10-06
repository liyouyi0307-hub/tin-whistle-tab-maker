const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function app(initialStorage = {}) {
    const nodes = new Map();
    const storage = new Map(Object.entries(initialStorage));
    const windowListeners = {};
    const document = {
        getElementById(id) {
            if (!nodes.has(id)) nodes.set(id, {
                value: id === 'whistle-key' ? 'D' : id === 'whistle-basic' ? '1' : '',
                innerHTML: '', textContent: '', hidden: false, checked: false, listeners: {},
                selectionStart: 0, selectionEnd: 0,
                addEventListener(event, handler) { this.listeners[event] = handler; },
                querySelectorAll() { return []; },
                querySelector() { return null; },
                focus() {},
                select() { this.selectionStart = 0; this.selectionEnd = this.value.length; },
                setRangeText(text, start, end, selectionMode = 'end') {
                    this.value = this.value.slice(0, start) + text + this.value.slice(end);
                    this.selectionStart = selectionMode === 'select' ? start : start + text.length;
                    this.selectionEnd = start + text.length;
                }
            });
            return nodes.get(id);
        }
    };
    const context = vm.createContext({ document, window: {
        addEventListener(event, handler) { windowListeners[event] = handler; }
    }, localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value)
    }, console, Blob, URL });
    vm.runInContext(source, context);
    return {
        run: code => vm.runInContext(code, context),
        node: id => document.getElementById(id),
        click: id => document.getElementById(id).listeners.click(),
        load: () => windowListeners.load(), storage,
        // JSON conversion makes values comparable across VM realms.
        value: code => JSON.parse(JSON.stringify(vm.runInContext(code, context)))
    };
}

test('D major and G major numbering retain every original natural fingering', () => {
    const a = app();
    const natural = {
        '1': [['1','111111'],['2','111110'],['3','111100'],['4','111000'],['5','110000'],['6','100000'],['7','000000'],
            ["1'",'011111'],["2'",'111110'],["3'",'111100'],["4'",'111000'],["5'",'110000'],["6'",'100000'],["7'",'000000'],["1''",'011111']],
        '5': [['5.','111111'],['6.','111110'],['7.','111100'],['1','111000'],['2','110000'],['3','100000'],['4','011000'],['5','011111'],['6','111110'],['7','111100'],
            ["1'",'111000'],["2'",'110000'],["3'",'100000'],["4'",'011110'],["5'",'011111']]
    };
    for (const [basic, notes] of Object.entries(natural)) {
        for (const [note, pattern] of notes) assert.equal(a.run(`parseDNote(${JSON.stringify(note)}, '${basic}').pattern`), pattern, `${basic}: ${note}`);
    }
});

test('each chromatic pitch has the verified half hole in both octaves, with enharmonic aliases', () => {
    const a = app();
    for (const [basic, pairs] of Object.entries({
        '1': [['#1','b2',63,'111112'],['#2','b3',65,'111120'],['#4','b5',68,'112000'],['#5','b6',70,'120000'],['#6','b7',72,'200000']],
        '5': [['#5.','b6.',63,'111112'],['#6.','b7.',65,'111120'],['#1','b2',68,'112000'],['#2','b3',70,'120000'],['#3','4',72,'011000']]
    })) {
        for (const [sharp, flat, pitch, pattern] of pairs) {
            for (const token of [sharp, flat]) {
                const note = a.value(`parseDNote(${JSON.stringify(token)}, '${basic}')`);
                assert.equal(note.pitch, pitch);
                assert.equal(note.pattern, pattern);
                const upper = token.endsWith('.') ? token.slice(0, -1) : token + "'";
                assert.equal(a.run(`parseDNote(${JSON.stringify(upper)}, '${basic}').pitch`), pitch + 12);
                assert.equal(a.run(`parseDNote(${JSON.stringify(upper)}, '${basic}').pattern`), pitch === 72 && basic === '5' ? '011110' : pattern);
            }
        }
    }
    for (const [left, right] of [['#3','4'],['b4','3'],['#7',"1'"],['b1\'','7']]) {
        assert.equal(a.run(`parseDNote(${JSON.stringify(left)}, '1').pitch`), a.run(`parseDNote(${JSON.stringify(right)}, '1').pitch`));
    }
});

test('Unicode signs, octave primes, compact notation and durations are fully parsed', () => {
    const a = app();
    assert.equal(a.run(`parseDNote('♯1′', '1').pitch`),75);
    assert.equal(a.run(`parseDNote('♭3’·', '1').pattern`),'111120');
    assert.equal(a.run(`parseDNote('♮3', '1').pitch`),66);
    const output = a.run(`convertJianpuToWhistle("1#12b334#45#56b771'|5·3 2·1 2---0", 'D', '1')`);
    assert.equal((output.match(/data-fingering=/g) || []).length, 18);
    assert.equal((output.match(/special-symbol/g) || []).length,4);
    assert.ok(!output.includes('no-mapping'));
    assert.ok(output.includes('♭3'));
    assert.ok(output.includes('5·'));
});

test('out of range and malformed notes are visible errors rather than truncated valid notes', () => {
    const a = app();
    for (const note of ['b1','1.',"#1''","7''","1'''",'1...']) assert.equal(a.run(`parseDNote(${JSON.stringify(note)}, '1').pattern`),null);
    for (const text of ['1hello','#','b','8','#0','1..\'']) {
        const output = a.run(`convertJianpuToWhistle(${JSON.stringify(text)}, 'D', '1')`);
        assert.ok(output.includes('无法识别'), text);
        assert.ok(!output.includes('data-fingering'), text);
    }
    const output = a.run(`convertJianpuToWhistle('<img src=x onerror=alert(1)>', 'D', '1')`);
    assert.ok(!output.includes('<img'));
    assert.ok(output.includes('&lt;img'));
    assert.throws(() => a.run(`convertJianpuToWhistle('   ', 'D', '1')`), /请输入/);
});

test('cross fingering options match the source and remain separate by octave', () => {
    const a = app();
    for (const [method, pattern] of [['cross23','011000'],['cross256','010011'],['cross2456','010111']]) {
        a.run(`dFingeringSettings = validateDSettings({72:{method:'${method}',pattern:'ignored'}})`);
        assert.equal(a.run(`parseDNote('b7','1').pattern`), pattern);
        assert.equal(a.run(`parseDNote('#6','1').pattern`), pattern);
        assert.equal(a.run(`parseDNote('4','5').pattern`), pattern);
        assert.equal(a.run(`parseDNote("b7'",'1').pattern`),'200000');
    }
    a.run(`dFingeringSettings = validateDSettings({68:{method:'legacy'},84:{method:'legacy'}})`);
    assert.equal(a.run(`parseDNote('#4','1').pattern`),'110111');
    assert.equal(a.run(`parseDNote("b7'",'1').pattern`),'011110');
});

test('researched fork presets match their sources and apply only to the listed register', () => {
    const a = app();
    const forks = {
        68: [['legacy','110111']],
        70: [['cross134','101100'],['cross1345','101110'],['cross13456','101111']],
        72: [['cross23','011000'],['cross256','010011'],['cross2456','010111'],['cross2346','011101'],['cross236','011001'],['cross2','010000'],['cross234','011100']],
        77: [['cross12356','111011'],['cross12346','111101']],
        80: [['cross1245','110110'],['cross1246','110101']],
        82: [['cross13','101000'],['cross12456','110111']],
        84: [['cross2','010000'],['legacy','011110'],['cross2456','010111']]
    };
    for (const pitch of [63,65,68,70,72,75,77,80,82,84]) {
        const choices = a.value(`getDFingeringChoices(${pitch})`);
        assert.deepEqual(choices.slice(1).map(c => [c.id,c.pattern]), forks[pitch] || []);
        assert.equal(new Set(choices.map(c => c.id)).size, choices.length);
        for (const choice of choices) {
            assert.match(choice.pattern,/^[012]{6}$/);
            assert.ok(a.run(`dFingeringSources[${JSON.stringify(choice.source)}].url.startsWith('https://')`));
            assert.ok(choice.hint.length > 0);
            if (choice.id !== 'half') assert.ok(!choice.pattern.includes('2'));
        }
    }
    for (const [pitch,method] of [[65,'cross12356'],[65,'cross12346'],[68,'cross1245'],[70,'cross13'],[72,'cross12456'],[84,'cross2346']]) {
        assert.throws(() => a.run(`validateDSettings({${pitch}:{method:'${method}'}})`), /未知指法/);
    }
});

test('octave shifts retain compact notation, signs, rests, durations and all whitespace', () => {
    const a = app();
    const original = "  1.♯2·b3\t|0---\n4' ＃5′′ n6.. ♮7·  ";
    const expected = "  1♯2'·b3'\t|0---\n4'' ＃5′′′ n6. ♮7'·  ";
    assert.equal(a.run(`transposeJianpuOctave(${JSON.stringify(original)},1)`),expected);
    assert.equal(a.run(`transposeJianpuOctave(${JSON.stringify(expected)},-1)`),original);
    for (const basic of ['1','3','4','5']) {
        for (const token of ['1','3.','♯4','b7','2·',"1''",'1..','4’′']) {
            for (const direction of [-1,1]) {
                const shifted = a.run(`transposeJianpuOctave(${JSON.stringify(token)},${direction})`);
                const before = a.run(`parseDNote(${JSON.stringify(token)},'${basic}').pitch`);
                assert.equal(a.run(`parseDNote(${JSON.stringify(shifted)},'${basic}').pitch`),before + 12 * direction);
            }
        }
    }
});

test('octave buttons regenerate and save a full score using the destination register settings', () => {
    const a = app();
    a.node('whistle-basic').value = '4';
    a.node('jianpu-input').value = '4. 7. |0-';
    a.node('title-input').value = 'Octave test';
    a.run(`dFingeringSettings = validateDSettings({68:{method:'legacy'},80:{method:'cross1245'}}); generateBtnClick()`);
    a.click('octave-up');
    assert.equal(a.node('jianpu-input').value,'4 7 |0-');
    assert.ok(a.node('whistle-output').innerHTML.includes('data-pitch="80" data-fingering="110110"'));
    assert.equal(JSON.parse(a.storage.get('TinWhistle')).jianpu,'4 7 |0-');
    assert.equal(a.node('title-input').value,'Octave test');
    a.click('octave-down');
    assert.equal(a.node('jianpu-input').value,'4. 7. |0-');
    assert.ok(a.node('whistle-output').innerHTML.includes('data-pitch="68" data-fingering="110111"'));
    const restored = app(Object.fromEntries(a.storage));
    restored.load();
    assert.equal(restored.node('jianpu-input').value,'4. 7. |0-');
});

test('out-of-range octave shifts remain reversible and never invent fingerings', () => {
    const a = app();
    a.node('jianpu-input').value = "1 1''";
    a.click('octave-up');
    assert.equal(a.node('jianpu-input').value,"1' 1'''");
    assert.ok(a.node('octave-status').textContent.includes('1 个音超出'));
    assert.ok(a.node('whistle-output').innerHTML.includes('超出 D 调常用音域'));
    assert.equal((a.node('whistle-output').innerHTML.match(/data-fingering/g)||[]).length,1);
    a.click('octave-down');
    assert.equal(a.node('jianpu-input').value,"1 1''");
    assert.ok(!a.node('whistle-output').innerHTML.includes('no-mapping'));
    a.node('jianpu-input').value = '1..';
    a.click('octave-down');
    assert.equal(a.node('jianpu-input').value,'1...');
    a.click('octave-up');
    assert.equal(a.node('jianpu-input').value,'1..');
});

test('invalid octave input is refused before any score, input, or saved data changes', () => {
    const a = app();
    a.node('jianpu-input').value = '1 2';
    a.run('generateBtnClick()');
    const output = a.node('whistle-output').innerHTML;
    const saved = a.storage.get('TinWhistle');
    for (const text of ['1 2 hello','1..\' 2','#0 2','1 8','0---|','  ']) {
        a.node('jianpu-input').value = text;
        a.click('octave-up');
        assert.equal(a.node('jianpu-input').value,text);
        assert.equal(a.node('whistle-output').innerHTML,output);
        assert.equal(a.storage.get('TinWhistle'),saved);
        assert.ok(a.node('octave-status').textContent.length > 0);
    }
});

test('local octave buttons create mixed-register sections and retain the selected passage', () => {
    const a = app();
    const original = "1 2 | 1' 2' | 1 2";
    a.node('jianpu-input').value = original;
    a.node('title-input').value = 'Mixed register';
    a.node('jianpu-input').selectionStart = original.indexOf("1'");
    a.node('jianpu-input').selectionEnd = original.indexOf("1'") + "1' 2'".length;
    a.click('selected-octave-down');
    assert.equal(a.node('jianpu-input').value,'1 2 | 1 2 | 1 2');
    assert.equal(a.node('jianpu-input').value.slice(a.node('jianpu-input').selectionStart,a.node('jianpu-input').selectionEnd),'1 2');
    a.click('selected-octave-up');
    assert.equal(a.node('jianpu-input').value,original);
    a.node('jianpu-input').selectionStart = original.lastIndexOf('1 2');
    a.node('jianpu-input').selectionEnd = original.length;
    a.click('selected-octave-up');
    const mixed = "1 2 | 1' 2' | 1' 2'";
    assert.equal(a.node('jianpu-input').value,mixed);
    assert.equal(JSON.parse(a.storage.get('TinWhistle')).jianpu,mixed);
    assert.equal(a.node('title-input').value,'Mixed register');
    assert.ok(a.node('octave-status').textContent.includes('选中的 2 个音'));
    const restored = app(Object.fromEntries(a.storage));
    restored.load();
    assert.equal(restored.node('jianpu-input').value,mixed);
    assert.equal((restored.node('whistle-output').innerHTML.match(/data-pitch="74"/g)||[]).length,2);
    assert.equal((restored.node('whistle-output').innerHTML.match(/data-pitch="62"/g)||[]).length,1);
});

test('partial selections expand to whole compact notes without touching adjacent notes or layout', () => {
    const a = app();
    const original = "  61#2'·b3\t|0---\n4  ";
    const beginning = original.indexOf('#');
    for (const offset of [0,1,2,3]) {
        const result = a.value(`transposeSelectedJianpuOctave(${JSON.stringify(original)},${beginning+offset},${beginning+offset+1},1)`);
        assert.equal(result.start,beginning);
        assert.equal(result.end,beginning+4);
        assert.equal(result.segment,"#2''·");
        assert.equal(result.noteCount,1);
        assert.equal(original.slice(0,result.start)+result.segment+original.slice(result.end),"  61#2''·b3\t|0---\n4  ");
        assert.equal(result.expanded,true);
    }
    a.node('jianpu-input').value = original;
    a.node('jianpu-input').selectionStart = beginning+1;
    a.node('jianpu-input').selectionEnd = beginning+2;
    a.click('selected-octave-up');
    a.click('selected-octave-down');
    assert.equal(a.node('jianpu-input').value,original);
    assert.equal(a.node('jianpu-input').selectionStart,beginning);
    assert.equal(a.node('jianpu-input').selectionEnd,beginning+4);
    const multiLine = "1 2 |\n♯4'· 0-- b7\t| 3 4";
    const start = multiLine.indexOf('♯');
    const end = multiLine.indexOf('\t');
    const result = a.value(`transposeSelectedJianpuOctave(${JSON.stringify(multiLine)},${start},${end},-1)`);
    assert.equal(multiLine.slice(0,result.start)+result.segment+multiLine.slice(result.end),"1 2 |\n♯4· 0-- b7.\t| 3 4");
});

test('empty or invalid local selections never fall back to shifting the whole score', () => {
    const a = app();
    a.node('jianpu-input').value = '1 2';
    a.run('generateBtnClick()');
    const output = a.node('whistle-output').innerHTML;
    const saved = a.storage.get('TinWhistle');
    for (const [text,start,end] of [['1 2',1,1],['1   2',1,4],['1 |0--- 2',2,7],['1 hello 2',2,7],["1 #2..' 3",2,7]]) {
        a.node('jianpu-input').value = text;
        a.node('jianpu-input').selectionStart = start;
        a.node('jianpu-input').selectionEnd = end;
        a.click('selected-octave-up');
        assert.equal(a.node('jianpu-input').value,text);
        assert.equal(a.node('whistle-output').innerHTML,output);
        assert.equal(a.storage.get('TinWhistle'),saved);
        assert.ok(a.node('octave-status').textContent.includes('选'));
    }
    for (const [start,end] of [[-1,1],[1,8],[2,1]]) assert.throws(()=>a.run(`transposeSelectedJianpuOctave('1 2',${start},${end},1)`),/选区/);
});

test('local octave changes use the destination register fingering and count only selected range errors', () => {
    const a = app();
    a.node('whistle-basic').value = '3';
    a.node('jianpu-input').value = "3. 1 | 1 | 3'";
    a.run(`dFingeringSettings = validateDSettings({70:{method:'cross1345'},82:{method:'cross12456'}}); generateBtnClick()`);
    a.node('jianpu-input').selectionStart = 7;
    a.node('jianpu-input').selectionEnd = 8;
    a.click('selected-octave-up');
    assert.equal(a.node('jianpu-input').value,"3. 1 | 1' | 3'");
    assert.ok(a.node('whistle-output').innerHTML.includes('data-pitch="70" data-fingering="101110"'));
    assert.ok(a.node('whistle-output').innerHTML.includes('data-pitch="82" data-fingering="110111"'));
    a.node('jianpu-input').selectionStart = a.node('jianpu-input').value.lastIndexOf("3'");
    a.node('jianpu-input').selectionEnd = a.node('jianpu-input').value.length;
    a.click('selected-octave-up');
    assert.equal(a.node('jianpu-input').value,"3. 1 | 1' | 3''");
    assert.ok(a.node('octave-status').textContent.includes('1 个音超出'));
    assert.equal((a.node('whistle-output').innerHTML.match(/no-mapping/g)||[]).length,1);
    a.click('selected-octave-down');
    assert.equal(a.node('jianpu-input').value,"3. 1 | 1' | 3'");
    assert.ok(!a.node('whistle-output').innerHTML.includes('no-mapping'));
});

test('valid local passages can be changed independently of errors elsewhere, and whole-score controls stay explicit', () => {
    const a = app();
    a.node('jianpu-input').value = 'hello 1 2';
    a.node('jianpu-input').selectionStart = 8;
    a.node('jianpu-input').selectionEnd = 9;
    a.click('selected-octave-up');
    assert.equal(a.node('jianpu-input').value,"hello 1 2'");
    assert.ok(a.node('whistle-output').innerHTML.includes('hello[无法识别]'));
    assert.ok(a.node('whistle-output').innerHTML.includes('data-pitch="76"'));
    a.node('jianpu-input').value = '1 2 | 3 4';
    a.node('jianpu-input').selectionStart = 0;
    a.node('jianpu-input').selectionEnd = 1;
    a.click('octave-up');
    assert.equal(a.node('jianpu-input').value,"1' 2' | 3' 4'");
});

test('bulk fork selection stays in preview, preserves custom settings, and reports every missing pitch', () => {
    const a = app();
    a.node('whistle-basic').value = '3';
    a.node('jianpu-input').value = "4. 5. 1 2 5 1' 2'";
    a.run(`dFingeringSettings = validateDSettings({68:{method:'custom',pattern:'102000'},72:{method:'cross234'}});
        draftDFingeringSettings = JSON.parse(JSON.stringify(dFingeringSettings)); generateBtnClick()`);
    const output = a.node('whistle-output').innerHTML;
    const saved = a.storage.get('TinWhistle');
    a.click('prefer-forks');
    assert.equal(a.node('whistle-output').innerHTML,output);
    assert.equal(a.storage.get('TinWhistle'),saved);
    assert.deepEqual(a.value('draftDFingeringSettings[68]'),{method:'custom',pattern:'102000'});
    assert.equal(a.run('draftDFingeringSettings[72].method'),'cross234');
    for (const pitch of [63,65,75]) {
        assert.ok(a.node('settings-status').textContent.includes(a.run(`getDPitchName(${pitch})`)));
        assert.equal(a.run(`draftDFingeringSettings[${pitch}]`),undefined);
    }
    assert.ok(a.node('d-fork-coverage').textContent.includes('20 种'));
    assert.ok(a.node('d-fork-coverage').textContent.includes('7 / 10'));
    a.click('apply-fingerings');
    for (const pitch of [70,72,77,80,82,84]) assert.ok(!a.run(`getSelectedDPattern(${pitch},'3')`).includes('2'));
    assert.equal(a.run(`getSelectedDPattern(63,'3')`),'111112');
    const sheet = a.value('getSheetData()');
    const restored = app();
    restored.run(`restoreSheet(${JSON.stringify(sheet)})`);
    assert.deepEqual(restored.value('getSheetData()'),sheet);
    a.click('prefer-half-holes');
    assert.equal(a.run('dFingeringSettings[72].method'),'cross234');
    a.click('apply-fingerings');
    for (const pitch of [63,65,68,70,72,75,77,80,82,84]) assert.ok(a.run(`getSelectedDPattern(${pitch},'3')`).includes('2'));
});

test('tube note 3 menus preview and apply researched forks to ordinary numbered notes, then restore', () => {
    const a = app();
    a.node('whistle-basic').value = '3';
    a.node('jianpu-input').value = "1 2 5 1' 2'";
    a.run('generateBtnClick(); updateDControls()');
    const before = a.node('whistle-output').innerHTML;
    const selections = [[70,'cross1345','101110'],[72,'cross2346','011101'],[77,'cross12356','111011'],[82,'cross13','101000'],[84,'cross2','010000']];
    for (const [pitch,method,pattern] of selections) {
        a.node('d-settings-grid').listeners.change({target:{dataset:{fingeringPitch:String(pitch)},value:method}});
        assert.equal(a.node('whistle-output').innerHTML,before);
        assert.ok(a.node('d-settings-grid').innerHTML.includes(`data-fingering="${pattern}"`));
    }
    assert.ok(a.node('d-settings-mode-hint').textContent.includes('不带升降号'));
    assert.ok(a.node('d-settings-grid').innerHTML.includes('仅高八度 F'));
    assert.ok(a.node('d-settings-grid').innerHTML.includes('低八度 F 尚无'));
    assert.ok(a.node('d-settings-grid').innerHTML.includes('tinwhistle.de'));
    a.click('apply-fingerings');
    for (const [token,pattern] of [['1','101110'],['2','011101'],['5','111011'],["1'",'101000'],["2'",'010000']]) {
        assert.equal(a.run(`parseDNote(${JSON.stringify(token)},'3').pattern`),pattern);
        assert.ok(a.node('whistle-output').innerHTML.includes(`data-fingering="${pattern}"`));
    }
    assert.equal(a.run(`parseDNote('5.','3').pattern`),'111120');
    const sheet = a.value('getSheetData()');
    const restored = app();
    restored.run(`restoreSheet(${JSON.stringify(sheet)})`);
    assert.deepEqual(restored.value('getSheetData()'),sheet);
    for (const [pitch,method,pattern] of selections) {
        assert.deepEqual(restored.value(`dFingeringSettings[${pitch}]`),{method,pattern});
    }
});

test('tube note 4 G sharp menus retain independent registers and their sources across mode changes', () => {
    const a = app();
    a.node('whistle-basic').value = '4';
    a.node('jianpu-input').value = '7. 7';
    a.run('generateBtnClick(); updateDControls()');
    for (const [pitch,method] of [[68,'legacy'],[80,'cross1245']]) {
        a.node('d-settings-grid').listeners.change({target:{dataset:{fingeringPitch:String(pitch)},value:method}});
    }
    assert.ok(a.node('d-settings-grid').innerHTML.includes('G♯ 指法实测讨论'));
    assert.ok(a.node('d-settings-grid').innerHTML.includes('Brother Steve'));
    a.click('apply-fingerings');
    assert.equal(a.run(`parseDNote('7.','4').pattern`),'110111');
    assert.equal(a.run(`parseDNote('7','4').pattern`),'110110');
    a.node('whistle-basic').value = '3';
    a.node('whistle-basic').listeners.change();
    assert.equal(a.run(`parseDNote('b7.','3').pattern`),'110111');
    assert.equal(a.run(`parseDNote('b7','3').pattern`),'110110');
    assert.ok(a.node('d-settings-grid').innerHTML.includes('筒音 3 · 简谱 ♭7'));
    const restored = app(Object.fromEntries(a.storage));
    restored.load();
    assert.equal(restored.run(`parseDNote('b7.','3').pattern`),'110111');
    assert.equal(restored.run(`parseDNote('b7','3').pattern`),'110110');
});

test('settings preview does not change the score until Apply; custom fingerings save and restore', () => {
    const a = app();
    a.node('jianpu-input').value = '#1 b2 #1\'';
    a.run(`generateBtnClick(); draftDFingeringSettings = {63:{method:'custom',pattern:'101202'}}; renderDSettings()`);
    assert.equal(a.run(`parseDNote('#1','1').pattern`),'111112');
    a.click('apply-fingerings');
    assert.equal(a.run(`parseDNote('#1','1').pattern`),'101202');
    assert.equal(a.run(`parseDNote('b2','1').pattern`),'101202');
    assert.equal(a.run(`parseDNote("#1'",'1').pattern`),'111112');
    assert.ok(a.node('whistle-output').innerHTML.includes('data-fingering="101202"'));
    const sheet = a.value('getSheetData()');
    const restored = app();
    restored.run(`restoreSheet(${JSON.stringify(sheet)})`);
    assert.equal(restored.run(`parseDNote('b2','1').pattern`),'101202');
    assert.deepEqual(restored.value('getSheetData()'),sheet);
    a.click('reset-fingerings');
    assert.equal(a.run(`parseDNote('#1','1').pattern`),'101202');
    a.click('apply-fingerings');
    assert.equal(a.run(`parseDNote('#1','1').pattern`),'111112');
});

test('invalid imported settings cannot overwrite score, title, or personal fingering', () => {
    const a = app();
    a.node('jianpu-input').value = '1 2 3';
    a.node('title-input').value = 'My tune';
    for (const settings of [{63:{method:'custom',pattern:'00000'}},{63:{method:'custom',pattern:'012345'}},{80:{method:'cross23'}},{90:{method:'half'}},null,[]]) {
        assert.throws(() => a.run(`restoreSheet({jianpu:'replacement',title:'changed',dFingeringSettings:${JSON.stringify(settings)}})`));
        assert.equal(a.node('jianpu-input').value, '1 2 3');
        assert.equal(a.node('title-input').value, 'My tune');
    }
    a.run(`dFingeringSettings = {63:{method:'custom',pattern:'101202'}}; restoreSheet({jianpu:'5 3 2 1',title:'Legacy'})`);
    assert.equal(a.run(`parseDNote('#1','1').pattern`),'101202');
});

test('saved tube note and settings survive reload, and old example loads offline', () => {
    const a = app();
    a.node('whistle-basic').value = '5';
    a.node('jianpu-input').value = '#5. b6. #3 4';
    a.node('title-input').value = 'Round trip';
    a.run(`dFingeringSettings = {72:{method:'half'}}; setLocalStorage()`);
    const saved = a.storage.get('TinWhistle');
    const restored = app({TinWhistle:saved});
    restored.load();
    assert.equal(restored.node('whistle-basic').value, '5');
    assert.equal(restored.run(`parseDNote('4','5').pattern`),'200000');
    assert.equal(restored.node('title-input').value,'Round trip');
    const offline = app();
    offline.load();
    assert.equal(offline.node('title-input').value,'Kingdom Dance');
    assert.ok(!offline.node('whistle-output').innerHTML.includes('no-mapping'));
});

test('six-hole SVG is printable and high octave breath is based on pitch', () => {
    const a = app();
    const low = a.run(`convertJianpuToWhistle('#1','D','1')`);
    const high = a.run(`convertJianpuToWhistle("#1'",'D','1')`);
    assert.equal((low.match(/<svg/g)||[]).length,6);
    assert.equal((low.match(/<path/g)||[]).length,1);
    assert.ok(low.includes('第6孔半孔'));
    assert.ok(high.includes('>+</div>'));
    assert.ok(!low.includes('>+</div>'));
    assert.ok(html.includes('print-color-adjust: exact'));
    assert.equal(a.run('whistleMapping.C'),undefined);
});

test('corrupt personal preferences never replace an existing saved tune with the example', () => {
    const a = app({ TinWhistle: JSON.stringify({jianpu:'1 2 3',title:'Keep this tune'}), TinWhistleDFingerings:'broken JSON' });
    a.load();
    assert.equal(a.node('title-input').value,'Keep this tune');
    assert.equal(a.node('jianpu-input').value,'1 2 3');
    assert.equal(JSON.parse(a.storage.get('TinWhistle')).title,'Keep this tune');
});

test('tube notes 3 and 4 use the correct tonic, low notes, and fingering in both octaves', () => {
    const a = app();
    const scales = {
        '3': [['3.',62,'111111'],['4.',63,'111112'],['5.',65,'111120'],['6.',67,'111000'],['7.',69,'110000'],['1',70,'120000'],['2',72,'200000'],['3',74,'011111'],
            ['4',75,'111112'],['5',77,'111120'],['6',79,'111000'],['7',81,'110000'],["1'",82,'120000'],["2'",84,'200000'],["3'",86,'011111']],
        '4': [['4.',62,'111111'],['5.',64,'111110'],['6.',66,'111100'],['7.',68,'112000'],['1',69,'110000'],['2',71,'100000'],['3',73,'000000'],['4',74,'011111'],
            ['5',76,'111110'],['6',78,'111100'],['7',80,'112000'],["1'",81,'110000'],["2'",83,'100000'],["3'",85,'000000'],["4'",86,'011111']]
    };
    for (const [basic, notes] of Object.entries(scales)) {
        for (const [token, pitch, pattern] of notes) {
            const note = a.value(`parseDNote(${JSON.stringify(token)}, '${basic}')`);
            assert.equal(note.pitch,pitch,`${basic}: ${token}`);
            assert.equal(note.pattern,pattern,`${basic}: ${token}`);
        }
    }
    for (const [basic, token] of [['3','2.'],['3','b3.'],['4','3.'],['4','b4.'],['3',"#3'"],['4',"#4'"]]) {
        assert.equal(a.run(`parseDNote(${JSON.stringify(token)}, '${basic}').pattern`),null);
    }
});

test('new modes share alternative fingerings by physical pitch and handle enharmonic notes', () => {
    const a = app();
    for (const [basic, pairs] of Object.entries({
        '3': [['#3.','4.',63],['#4.','b5.',64],['#6.','b7.',68],['b1','7.',69],['#2','b3',73]],
        '4': [['#4.','b5.',63],['#5.','b6.',65],['#1','b2',70],['#2','b3',72]]
    })) for (const [left, right, pitch] of pairs) {
        for (const token of [left, right]) assert.equal(a.run(`parseDNote(${JSON.stringify(token)}, '${basic}').pitch`),pitch);
    }
    a.run(`dFingeringSettings = validateDSettings({72:{method:'cross23'},68:{method:'custom',pattern:'101202'}})`);
    assert.equal(a.run(`parseDNote('2','3').pattern`),'011000');
    assert.equal(a.run(`parseDNote('b3','4').pattern`),'011000');
    assert.equal(a.run(`parseDNote('b7.','3').pattern`),'101202');
    assert.equal(a.run(`parseDNote('7.','4').pattern`),'101202');
    assert.equal(a.run(`parseDNote("2'",'3').pattern`),'200000');
});

test('every mode generates a complete in-range chromatic example and matching settings labels', () => {
    const a = app();
    for (const basic of ['1','3','4','5']) {
        for (let pitch = 62; pitch <= 86; pitch++) {
            const token = a.run(`formatDJianpuPitch(${pitch}, '${basic}')`);
            assert.equal(a.run(`parseDNote(${JSON.stringify(token)}, '${basic}').pitch`),pitch);
            const reference = a.value(`referenceDNote(${pitch}, '${basic}')`);
            assert.equal(a.run(`parseDNote(${JSON.stringify(reference.label)}, '${basic}').pitch`),pitch);
        }
        const output = a.run(`convertJianpuToWhistle(getDChromaticExample('${basic}'), 'D', '${basic}')`);
        assert.equal((output.match(/data-fingering=/g)||[]).length,26);
        assert.ok(!output.includes('no-mapping'));
    }
    assert.equal(a.run(`formatDJianpuPitch(62,'3')`),'3.');
    assert.equal(a.run(`formatDJianpuPitch(62,'4')`),'4.');
    assert.equal(a.value(`referenceDNote(63,'3')`).label,'4.');
    assert.equal(a.value(`referenceDNote(68,'4')`).label,'7.');
});

test('new tube modes and personal settings round trip through JSON and browser reload', () => {
    for (const basic of ['3','4']) {
        const a = app();
        a.node('whistle-basic').value = basic;
        a.node('jianpu-input').value = `${basic}. 5. 1`;
        a.node('title-input').value = 'New tube mode';
        a.run(`dFingeringSettings = {72:{method:'cross23'}}; setLocalStorage()`);
        const saved = a.storage.get('TinWhistle');
        const restored = app({TinWhistle:saved});
        restored.load();
        assert.equal(restored.node('whistle-basic').value,basic);
        assert.equal(restored.node('jianpu-input').value,`${basic}. 5. 1`);
        assert.equal(restored.run(`getSelectedDPattern(72,'${basic}')`),'011000');
        assert.ok(restored.node('d-basic-help').textContent.includes(`最低 ${basic}. = D4`));
        assert.equal(restored.node('d-basic-3').hidden,false);
        assert.equal(restored.node('d-basic-4').disabled,false);
    }
});

test('mode changes refresh the score, preserve input and settings, and keep new modes D-only', () => {
    const a = app();
    a.node('jianpu-input').value = '4. 5. 1';
    a.run(`dFingeringSettings = {72:{method:'cross23'}}`);
    a.node('whistle-basic').value = '3';
    a.node('whistle-basic').listeners.change();
    assert.ok(a.node('whistle-output').innerHTML.includes('data-pitch="63" data-fingering="111112"'));
    a.node('whistle-basic').value = '4';
    a.node('whistle-basic').listeners.change();
    assert.ok(a.node('whistle-output').innerHTML.includes('data-pitch="62" data-fingering="111111"'));
    assert.equal(a.node('jianpu-input').value,'4. 5. 1');
    assert.equal(a.run(`getSelectedDPattern(72,'4')`),'011000');
    a.node('whistle-key').value = 'C';
    a.node('whistle-key').listeners.change();
    assert.equal(a.node('whistle-basic').value,'1');
    assert.equal(a.node('d-basic-3').hidden,true);
    assert.equal(a.node('d-basic-4').disabled,true);
    assert.equal(a.run('whistleMapping.C'),undefined);
    for (const basic of ['2','6','99',3]) {
        assert.throws(() => a.run(`restoreSheet({jianpu:'replacement',title:'bad',whistleKey:'D',whistleBasic:${JSON.stringify(basic)}})`));
        assert.equal(a.node('jianpu-input').value,'4. 5. 1');
    }
});

test('one sheet keeps different local tube modes and returns individual passages to the global default', () => {
    const exampleData = JSON.parse(fs.readFileSync(path.join(__dirname,'..','MixedTubeModes.json'),'utf8'));
    const example = app();
    example.run(`restoreSheet(${JSON.stringify(exampleData)}); generateBtnClick()`);
    assert.deepEqual([...example.node('whistle-output').innerHTML.matchAll(/data-pitch="(\d+)"/g)].map(match=>Number(match[1])),[62,64,66,67,69,71,70,72,74]);
    const a = app();
    a.node('jianpu-input').value = '1 2 | 1 2 | 1 2';
    a.node('jianpu-input').selectionStart = 6;
    a.node('jianpu-input').selectionEnd = 9;
    a.node('selected-basic').value = '5';
    a.click('apply-selected-basic');
    assert.equal(a.node('jianpu-input').value,'1 2 | 1 2 | 1 2');
    assert.deepEqual(a.value('dNoteModes'),[{start:6,end:7,basic:'5'},{start:8,end:9,basic:'5'}]);
    assert.deepEqual([...a.node('whistle-output').innerHTML.matchAll(/data-pitch="(\d+)"/g)].map(match=>Number(match[1])),[62,64,67,69,62,64]);
    assert.equal((a.node('whistle-output').innerHTML.match(/class="tube-label">筒音/g)||[]).length,3);
    a.node('jianpu-input').selectionStart = 0;
    a.node('jianpu-input').selectionEnd = 3;
    a.node('selected-basic').value = '1';
    a.click('apply-selected-basic');
    a.node('whistle-basic').value = '4';
    a.node('whistle-basic').listeners.change();
    assert.deepEqual([...a.node('whistle-output').innerHTML.matchAll(/data-pitch="(\d+)"/g)].map(match=>Number(match[1])),[62,64,67,69,69,71]);
    a.node('selected-basic').value = 'default';
    a.click('apply-selected-basic');
    assert.deepEqual(a.value('dNoteModes'),[{start:6,end:7,basic:'5'},{start:8,end:9,basic:'5'}]);
    assert.deepEqual([...a.node('whistle-output').innerHTML.matchAll(/data-pitch="(\d+)"/g)].map(match=>Number(match[1])),[69,71,67,69,69,71]);
});

test('rendered score selection drives tube and octave actions without using the textarea selection', () => {
    const a = app();
    a.node('jianpu-input').value = '1 2 | 1 2 | 1 2';
    a.node('jianpu-input').selectionStart = 0;
    a.node('jianpu-input').selectionEnd = 15;
    a.run('generateBtnClick(); selectScoreToken(8,9); selectScoreToken(6,7,true)');
    assert.deepEqual(a.value('activeJianpuSelection()'),{start:6,end:9});
    a.node('score-basic').value = '5';
    a.click('apply-score-basic');
    assert.equal(a.run('selectionSource'),'score');
    a.click('score-octave-up');
    assert.equal(a.node('jianpu-input').value,"1 2 | 1' 2' | 1 2");
    assert.deepEqual(a.value('dNoteModes'),[{start:6,end:8,basic:'5'},{start:9,end:11,basic:'5'}]);
    assert.deepEqual(a.value('scoreSelection'),{start:6,end:11});
    assert.deepEqual(a.value('scoreAnchor'),{start:9,end:11});
    assert.ok(a.node('whistle-output').innerHTML.includes('data-pitch="79"'));
    a.click('score-octave-down');
    assert.equal(a.node('jianpu-input').value,'1 2 | 1 2 | 1 2');
    assert.deepEqual(a.value('dNoteModes'),[{start:6,end:7,basic:'5'},{start:8,end:9,basic:'5'}]);
    a.click('clear-score-selection');
    const saved = a.storage.get('TinWhistle');
    a.click('score-octave-up');
    assert.equal(a.storage.get('TinWhistle'),saved);
    assert.ok(a.node('score-selection-status').textContent.includes('选中'));
});

test('local tube modes survive octave length changes, custom fingering, JSON import and browser reload', () => {
    const a = app();
    a.node('jianpu-input').value = '1 | 1 | 1';
    a.node('title-input').value = 'Mixed tube modes';
    a.run("dFingeringSettings = validateDSettings({70:{method:'cross1345'},82:{method:'cross12456'}}); generateBtnClick(); selectScoreToken(4,5); applySelectedBasic('3')");
    assert.ok(a.node('whistle-output').innerHTML.includes('data-pitch="70" data-fingering="101110"'));
    a.click('score-octave-up');
    assert.equal(a.node('jianpu-input').value,"1 | 1' | 1");
    assert.ok(a.node('whistle-output').innerHTML.includes('data-pitch="82" data-fingering="110111"'));
    a.click('octave-up');
    assert.equal(a.node('jianpu-input').value,"1' | 1'' | 1'");
    assert.ok(a.node('octave-status').textContent.includes('1 个音超出'));
    assert.deepEqual(a.value('dNoteModes'),[{start:5,end:8,basic:'3'}]);
    a.click('octave-down');
    assert.equal(a.node('jianpu-input').value,"1 | 1' | 1");
    const sheet = a.value('getSheetData()');
    assert.deepEqual(sheet.dNoteModes,[{start:4,end:6,basic:'3'}]);
    const imported = app();
    imported.run(`restoreSheet(${JSON.stringify(sheet)}); generateBtnClick()`);
    assert.deepEqual(imported.value('getSheetData()'),sheet);
    const restored = app(Object.fromEntries(a.storage));
    restored.load();
    assert.deepEqual(restored.value('getSheetData()'),sheet);
    assert.ok(restored.node('whistle-output').innerHTML.includes('data-pitch="82" data-fingering="110111"'));
    imported.run("restoreSheet({jianpu:'1 2',title:'Old score'}); generateBtnClick()");
    assert.deepEqual(imported.value('dNoteModes'),[]);
    assert.equal(imported.value('getSheetData()').dNoteModes,undefined);
});

test('text edits retain modes only where notes can still be located and never shift a mode onto a neighbor', () => {
    const a = app();
    const modes = [{start:0,end:1,basic:'5'},{start:2,end:3,basic:'3'},{start:4,end:5,basic:'4'}];
    const remap = (before,after) => a.value(`remapNoteModes(${JSON.stringify(modes)},${JSON.stringify(before)},${JSON.stringify(after)})`);
    assert.deepEqual(remap('1 2 3','0 | 1 2 3'),modes.map(mode=>({...mode,start:mode.start+4,end:mode.end+4})));
    assert.deepEqual(remap('1 2 3',"1 2' 3"),[{start:0,end:1,basic:'5'},{start:2,end:4,basic:'3'},{start:5,end:6,basic:'4'}]);
    assert.deepEqual(remap('1 2 3','1 #2 3'),[{start:0,end:1,basic:'5'},{start:2,end:4,basic:'3'},{start:5,end:6,basic:'4'}]);
    assert.deepEqual(remap('1 2 3','1 7 3'),modes);
    assert.deepEqual(remap('1 2 3','1 3'),[{start:0,end:1,basic:'5'},{start:2,end:3,basic:'4'}]);
    assert.deepEqual(remap('1 2 3','4 5 3'),[{start:4,end:5,basic:'4'}]);
    assert.deepEqual(remap('1 2 3','1 hello 3'),[{start:0,end:1,basic:'5'},{start:8,end:9,basic:'4'}]);
    a.run(`restoreSheet({jianpu:'1 2 3',title:'Edited',whistleKey:'D',dNoteModes:${JSON.stringify(modes)}}); generateBtnClick()`);
    a.node('jianpu-input').value = "1 2' 3";
    a.node('jianpu-input').listeners.input();
    a.run('generateBtnClick()');
    assert.deepEqual(a.value('getSheetData().dNoteModes'),[{start:0,end:1,basic:'5'},{start:2,end:4,basic:'3'},{start:5,end:6,basic:'4'}]);
});

test('invalid local mode imports cannot overwrite the current score or saved personal data', () => {
    const a = app();
    a.run("restoreSheet({jianpu:'1 2',title:'Keep',whistleKey:'D',dNoteModes:[{start:2,end:3,basic:'5'}]}); generateBtnClick()");
    const before = a.value('getSheetData()');
    const saved = a.storage.get('TinWhistle');
    for (const modes of [{},null,[{start:1,end:2,basic:'5'}],[{start:0,end:2,basic:'5'}],[{start:0,end:1,basic:'2'}],
        [{start:0,end:1,basic:5}],[{start:2,end:3,basic:'5'},{start:0,end:1,basic:'1'}],
        [{start:0,end:1,basic:'1'},{start:0,end:1,basic:'5'}]]) {
        assert.throws(()=>a.run(`restoreSheet({jianpu:'1 2',title:'Bad',whistleKey:'D',dNoteModes:${JSON.stringify(modes)}})`),/局部筒音/);
        assert.deepEqual(a.value('getSheetData()'),before);
        assert.equal(a.storage.get('TinWhistle'),saved);
    }
});

test('beforeinput positions distinguish identical notes when a user deletes or inserts at the caret', () => {
    const a = app();
    const modes = [{start:0,end:1,basic:'5'},{start:2,end:3,basic:'3'},{start:4,end:5,basic:'4'}];
    function edit(start,end,inputType,after) {
        a.run(`restoreSheet({jianpu:'1 1 1',title:'Repeated notes',whistleKey:'D',dNoteModes:${JSON.stringify(modes)}}); generateBtnClick()`);
        a.node('jianpu-input').selectionStart = start;
        a.node('jianpu-input').selectionEnd = end;
        a.node('jianpu-input').listeners.beforeinput({inputType});
        a.node('jianpu-input').value = after;
        a.node('jianpu-input').listeners.input();
        return a.value('dNoteModes');
    }
    assert.deepEqual(edit(0,2,'deleteContentForward','1 1'),[{start:0,end:1,basic:'3'},{start:2,end:3,basic:'4'}]);
    assert.deepEqual(edit(3,5,'deleteContentBackward','1 1'),[{start:0,end:1,basic:'5'},{start:2,end:3,basic:'3'}]);
    assert.deepEqual(edit(2,2,'deleteWordBackward','1 1'),[{start:0,end:1,basic:'3'},{start:2,end:3,basic:'4'}]);
    assert.deepEqual(edit(0,0,'insertFromPaste','1 1 1 1'),modes.map(mode=>({...mode,start:mode.start+2,end:mode.end+2})));
});

test('empty, malformed and stale score selections cannot apply local modes to an unintended passage', () => {
    const a = app();
    a.node('jianpu-input').value = '1 |0- 2';
    a.run('generateBtnClick()');
    for (const [start,end] of [[0,0],[2,5],[1,2]]) {
        a.node('jianpu-input').selectionStart = start;
        a.node('jianpu-input').selectionEnd = end;
        a.run("applySelectedBasic('5')");
        assert.deepEqual(a.value('dNoteModes'),[]);
    }
    a.run('selectScoreToken(0,1)');
    a.node('jianpu-input').value = '7 2';
    const saved = a.storage.get('TinWhistle');
    assert.equal(a.run('selectScoreToken(0,1)'),false);
    a.run("applySelectedBasic('5')");
    a.click('score-octave-up');
    assert.equal(a.node('jianpu-input').value,'7 2');
    assert.equal(a.storage.get('TinWhistle'),saved);
    assert.ok(a.node('score-selection-status').textContent.includes('先生成'));
    a.node('jianpu-input').value = '1 hello 2';
    a.node('jianpu-input').listeners.input();
    a.node('jianpu-input').selectionStart = 2;
    a.node('jianpu-input').selectionEnd = 7;
    a.run("applySelectedBasic('5')");
    assert.deepEqual(a.value('dNoteModes'),[]);
});

test('compact and Unicode notes have exact selectable boundaries, local modes and printed transition labels', () => {
    const a = app();
    const text = "1♯2′·b30-\n| 4";
    const tokens = a.value(`positionedJianpuTokens(${JSON.stringify(text)})`);
    assert.deepEqual(tokens.map(token=>[token.text,token.start,token.end]),[['1',0,1],['♯2′·',1,5],['b3',5,7],['0',7,8],['-',8,9],['|',10,11],['4',12,13]]);
    a.node('jianpu-input').value = text;
    a.node('jianpu-input').selectionStart = 3;
    a.node('jianpu-input').selectionEnd = 4;
    a.run("applySelectedBasic('5')");
    assert.deepEqual(a.value('dNoteModes'),[{start:1,end:5,basic:'5'}]);
    assert.ok(a.node('whistle-output').innerHTML.includes('data-source-start="1" data-source-end="5" data-basic="5"'));
    assert.ok(a.node('whistle-output').innerHTML.includes('筒音 5 · 局部'));
    a.run('selectScoreToken(1,5)');
    a.click('score-octave-down');
    assert.equal(a.node('jianpu-input').value,'1♯2·b30-\n| 4');
    assert.deepEqual(a.value('dNoteModes'),[{start:1,end:4,basic:'5'}]);
    assert.ok(a.node('whistle-output').innerHTML.includes('data-pitch="70"'));
    a.run("selectScoreToken(10,11); applySelectedBasic('4')");
    assert.ok(a.node('local-basic-status').textContent.includes('没有音符'));
});

test('single-note editing changes a low 7 immediately, keeps its tube mode and saves each valid value', () => {
    const a = app();
    const original = '4. 5. 7. | 1 2';
    a.run(`restoreSheet({jianpu:${JSON.stringify(original)},title:'Fine tune',whistleKey:'D',whistleBasic:'4',dNoteModes:[{start:6,end:8,basic:'5'}]}); generateBtnClick()`);
    assert.equal(a.run('beginScoreNoteEdit(6,8)'),true);
    assert.equal(a.node('score-note-editor').hidden,false);
    assert.equal(a.node('score-note-input').value,'7.');
    for (const [text,pitch] of [['1',67],['2',69],['3',71]]) {
        assert.equal(a.run(`updateScoreNote('${text}')`),true);
        assert.equal(a.node('jianpu-input').value,`4. 5. ${text} | 1 2`);
        assert.deepEqual(a.value('dNoteModes'),[{start:6,end:7,basic:'5'}]);
        assert.ok(a.node('whistle-output').innerHTML.includes(`data-pitch="${pitch}"`));
        assert.equal(JSON.parse(a.storage.get('TinWhistle')).jianpu,`4. 5. ${text} | 1 2`);
        assert.equal(a.node('score-note-editor').hidden,false);
        assert.equal(a.run('selectionSource'),'score');
    }
    a.node('score-note-input').value = '3';
    assert.equal(a.run('finishScoreNoteEdit()'),true);
    assert.equal(a.node('score-note-editor').hidden,true);
    const restored = app(Object.fromEntries(a.storage));
    restored.load();
    assert.equal(restored.node('jianpu-input').value,'4. 5. 3 | 1 2');
    assert.equal(restored.node('title-input').value,'Fine tune');
    assert.deepEqual(restored.value('dNoteModes'),[{start:6,end:7,basic:'5'}]);
});

test('compact note editing remaps surrounding modes, supports rests and can cancel the complete edit session', () => {
    const a = app();
    const original = "1b7.·23#4′\t|0-";
    const modes = [{start:1,end:5,basic:'4'},{start:7,end:10,basic:'5'}];
    a.run(`restoreSheet({jianpu:${JSON.stringify(original)},title:'Compact',whistleKey:'D',dNoteModes:${JSON.stringify(modes)}}); generateBtnClick(); beginScoreNoteEdit(1,5)`);
    const before = a.value('getSheetData()');
    assert.equal(a.run(`updateScoreNote('♯1′·')`),true);
    assert.equal(a.node('jianpu-input').value,"1♯1′·23#4′\t|0-");
    assert.deepEqual(a.value('dNoteModes'),modes);
    assert.equal(a.run("updateScoreNote('0')"),true);
    assert.equal(a.node('jianpu-input').value,"1023#4′\t|0-");
    assert.deepEqual(a.value('dNoteModes'),[{start:4,end:7,basic:'5'}]);
    assert.equal(a.run("updateScoreNote('2')"),true);
    assert.deepEqual(a.value('dNoteModes'),[{start:1,end:2,basic:'4'},{start:4,end:7,basic:'5'}]);
    assert.equal(a.run('finishScoreNoteEdit(true)'),true);
    assert.deepEqual(a.value('getSheetData()'),before);
    assert.equal(a.node('score-note-editor').hidden,true);
    a.run('selectScoreToken(11,12)');
    a.click('edit-score-note');
    assert.ok(a.node('score-selection-status').textContent.includes('只选中一个'));
});

test('unfinished or invalid single-note input leaves the last valid score and saved data intact', () => {
    const a = app();
    a.node('jianpu-input').value = '1 2 3';
    a.run('generateBtnClick(); beginScoreNoteEdit(2,3)');
    const before = a.value('getSheetData()');
    const output = a.node('whistle-output').innerHTML;
    const saved = a.storage.get('TinWhistle');
    for (const text of ['', '#', '12', '1 2', "1.'", 'hello', '<script>', '|', '-']) {
        assert.equal(a.run(`updateScoreNote(${JSON.stringify(text)})`),false);
        assert.deepEqual(a.value('getSheetData()'),before);
        assert.equal(a.node('whistle-output').innerHTML,output);
        assert.equal(a.storage.get('TinWhistle'),saved);
        a.node('score-note-input').value = text;
        assert.equal(a.run('finishScoreNoteEdit()'),false);
        assert.equal(a.node('score-note-editor').hidden,false);
    }
    a.node('jianpu-input').value = '7 2 3';
    assert.equal(a.run("updateScoreNote('4')"),false);
    assert.equal(a.run('finishScoreNoteEdit(true)'),false);
    assert.equal(a.node('jianpu-input').value,'7 2 3');
    assert.equal(a.storage.get('TinWhistle'),saved);
    assert.equal(a.run('beginScoreNoteEdit(0,1)'),false);
    a.node('jianpu-input').listeners.input();
    assert.equal(a.node('score-note-editor').hidden,true);
});

test('direct edits use new pitch preferences, mark range errors and close cleanly before other score actions', () => {
    const a = app();
    a.run("restoreSheet({jianpu:'1 1 | 1',title:'Pitch choices',whistleKey:'D',whistleBasic:'3',dFingeringSettings:{70:{method:'cross1345'},82:{method:'cross12456'}}}); generateBtnClick(); beginScoreNoteEdit(2,3)");
    assert.equal(a.run(`updateScoreNote("1'")`),true);
    assert.ok(a.node('whistle-output').innerHTML.includes('data-pitch="82" data-fingering="110111"'));
    assert.equal(a.run(`updateScoreNote("1''")`),true);
    assert.ok(a.node('whistle-output').innerHTML.includes('no-mapping'));
    assert.ok(a.node('score-note-status').textContent.includes('超出'));
    assert.equal(a.run("updateScoreNote('1')"),true);
    a.click('score-octave-up');
    assert.equal(a.node('jianpu-input').value,"1 1' | 1");
    assert.equal(a.node('score-note-editor').hidden,true);
    assert.equal(a.run('scoreNoteEdit'),null);
    a.run('selectScoreToken(0,1); selectScoreToken(2,4,true)');
    a.click('edit-score-note');
    assert.equal(a.node('score-note-editor').hidden,true);
    a.run('selectScoreToken(0,1)');
    a.click('edit-score-note');
    assert.equal(a.node('score-note-editor').hidden,false);
    a.run("applySelectedBasic('5')");
    assert.equal(a.node('score-note-editor').hidden,true);
});
