import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createPrompter } from '../../src/cli/prompter.js';

/*
 * Answers are fed one per prompt, like a user typing after each question;
 * readline drops lines that arrive before a question is pending.
 */
const prompterWithInput = (text) => {
    const answers = text.split('\n').slice(0, -1);
    const input = new PassThrough();
    const output = new PassThrough();
    let written = '';
    output.on('data', (chunk) => {
        const piece = chunk.toString();
        written += piece;
        if (piece.endsWith(': ') || piece.endsWith(') ')) {
            setImmediate(() => input.write(`${answers.shift() ?? ''}\n`));
        }
    });
    const prompter = createPrompter({ input, output });
    return { prompter, written: () => written };
};

test('askText returns the default when Enter is pressed', async () => {
    // Given
    const { prompter } = prompterWithInput('\n');

    // When
    const answer = await prompter.askText('Release version', '1.4.0');
    prompter.close();

    // Then
    assert.equal(answer, '1.4.0');
});

test('askValidated re-prompts until the check passes', async () => {
    // Given
    const { prompter, written } = prompterWithInput('bad\n2.0.0\n');
    const check = (value) => {
        if (value === 'bad') {
            return 'not valid SemVer';
        }
        return undefined;
    };

    // When
    const answer = await prompter.askValidated('Release version', '1.4.0', check);
    prompter.close();

    // Then
    assert.equal(answer, '2.0.0');
    assert.match(written(), /not valid SemVer/);
});

test('confirm returns the default on Enter and false on n', async () => {
    // Given
    const { prompter } = prompterWithInput('\nn\n');

    // When
    const first = await prompter.confirm('Proceed?', true);
    const second = await prompter.confirm('Proceed?', true);
    prompter.close();

    // Then
    assert.equal(first, true);
    assert.equal(second, false);
});

test('choose returns the option at the entered number', async () => {
    // Given
    const { prompter, written } = prompterWithInput('9\n2\n');
    const options = [{ name: 'a' }, { name: 'b' }];

    // When
    const chosen = await prompter.choose('Select:', options, (option) => option.name);
    prompter.close();

    // Then
    assert.equal(chosen.name, 'b');
    assert.match(written(), /Please enter a number between 1 and 2/);
});
