const hsm = require('../src/hsm.js');

const model = hsm.define('Test',
    hsm.initial(hsm.target('operational')),
    hsm.state('operational',
        hsm.initial(hsm.target('red')),
        hsm.state('red',
            hsm.transition(hsm.on('T1'), hsm.target('../green_choice'))
        ),
        hsm.choice('green_choice',
            hsm.transition(hsm.target('../green'))
        ),
        hsm.state('green',
            hsm.transition(hsm.on('T2'), hsm.target('../red'))
        )
    )
);

class Inst extends hsm.Instance {}
const ctx = new hsm.Context();
const inst = new Inst();
hsm.start(ctx, inst, model);
inst.dispatch({name: 'T1'});

const greenChoice = model.members['/Test/operational/green_choice'];
console.log('green_choice exists?', !!greenChoice);
if (greenChoice) {
    console.log('kind:', greenChoice.kind);
    console.log('is Choice?', hsm.isKind(greenChoice.kind, hsm.kinds.Choice));
}

console.log('state:', inst.state());
