import { action, observable } from "mobx";
import { observer } from "mobx-react-lite";

const Timer = observer(({ state }: { state: any }) => {
  return (
    <div>
      <button
        onClick={action(() => {
          state.count++;
        })}
      >
        {state.count}
      </button>
    </div>
  );
});

class TimerComponent {
  state = observable({ count: 1 });

  constructor(durationText: string) {}

  render() {
    return <Timer state={this.state} />;
  }

  destroy() {}
}

export function createTimerComponent(durationText: string): TimerComponent {
  return new TimerComponent(durationText);
}
