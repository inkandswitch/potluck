import { action, computed, makeObservable, observable } from "mobx";
import { observer } from "mobx-react-lite";
import { generateNanoid } from "./utils";

type NumberSliderState = {
  value: number;
};

const NumberSlider = observer(
  ({
    state,
    range,
  }: {
    state: NumberSliderState;
    range: [from: number, to: number];
  }) => {
    return (
      <div className="inline-flex items-center align-middle">
        <input
          type="range"
          min={range[0]}
          max={range[1]}
          value={state.value}
          onChange={action((e) => {
            state.value = parseFloat(e.target.value);
          })}
          className="h-1"
        />
      </div>
    );
  }
);

class NumberSliderComponentData {
  constructor(readonly state: NumberSliderState) {
    makeObservable(this, {
      value: computed,
    });
  }

  get value() {
    return this.state.value;
  }
}

export class NumberSliderComponent {
  id = generateNanoid();
  state: NumberSliderState;
  data: NumberSliderComponentData;

  constructor(initialValue: number, readonly range: [number, number]) {
    this.state = observable({
      value: initialValue,
    });
    this.data = new NumberSliderComponentData(this.state);
  }

  render() {
    return <NumberSlider state={this.state} range={this.range} key={this.id} />;
  }

  destroy() {}
}

export function createNumberSliderComponent(
  initialValue: number
): NumberSliderComponent {
  return new NumberSliderComponent(initialValue, [0, 10]);
}
