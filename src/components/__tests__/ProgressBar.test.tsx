import { render, screen } from '@testing-library/react-native';

import { ProgressBar } from '@/components/ProgressBar';

function fill(): { className: string; width: string } {
  const track = screen.toJSON();
  const bar = track?.children[0];
  if (!bar || typeof bar === 'string') {
    throw new Error('ProgressBar rendered no fill element');
  }
  return { className: bar.props.className, width: bar.props.style.width };
}

describe('ProgressBar', () => {
  it('fills proportionally below the first threshold', async () => {
    await render(<ProgressBar value={40} limit={100} />);
    expect(fill().width).toBe('40%');
    expect(fill().className).toContain('bg-driving');
  });

  it('stops at the track end once the value passes the limit', async () => {
    await render(<ProgressBar value={150} limit={100} />);
    expect(fill().width).toBe('100%');
  });

  it('does not change color at the informational 75% level', async () => {
    await render(<ProgressBar value={75} limit={100} />);
    expect(fill().className).toContain('bg-driving');
  });

  it('holds that color right up to the warning threshold', async () => {
    await render(<ProgressBar value={89} limit={100} />);
    expect(fill().className).toContain('bg-driving');
  });

  it('stays amber at the 90% warning threshold', async () => {
    await render(<ProgressBar value={90} limit={100} />);
    expect(fill().className).toContain('bg-warning');
  });

  it('turns red once the limit is reached', async () => {
    await render(<ProgressBar value={100} limit={100} />);
    expect(fill().className).toContain('bg-danger');
  });

  it('stays red past the limit instead of wrapping back to green', async () => {
    await render(<ProgressBar value={260} limit={100} />);
    expect(fill().className).toContain('bg-danger');
    expect(fill().className).not.toContain('bg-driving');
  });
});
