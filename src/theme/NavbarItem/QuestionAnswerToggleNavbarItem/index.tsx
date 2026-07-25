import {
  type MouseEventHandler,
  type ReactNode,
} from 'react';
import clsx from 'clsx';
import {useAnswerVisibility} from '@site/src/components/Question';

import styles from './styles.module.css';

type Props = {
  className?: string;
  mobile?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  position?: 'left' | 'right';
};

function AnswerVisibilityIcon({
  answersVisible,
}: {
  answersVisible: boolean;
}): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className={styles.icon}
      viewBox="0 0 24 24"
      width="18"
      height="18">
      <path
        d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="2.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      {!answersVisible && (
        <path
          d="m5 19 14-14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export default function QuestionAnswerToggleNavbarItem({
  className,
  mobile = false,
  onClick,
  position: _position,
}: Props): ReactNode {
  const {command, toggleAllAnswers} = useAnswerVisibility();
  const label = command.visible ? '隐藏全部答案' : '显示全部答案';

  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    toggleAllAnswers();
    onClick?.(event);
  };

  if (mobile) {
    return (
      <li className="menu__list-item">
        <button
          type="button"
          className={clsx('menu__link', styles.mobileButton, className)}
          data-question-global-answer-toggle
          aria-pressed={command.visible}
          onClick={handleClick}>
          <AnswerVisibilityIcon answersVisible={command.visible} />
          <span>{label}</span>
        </button>
      </li>
    );
  }

  return (
    <button
      type="button"
      className={clsx(
        'navbar__item',
        'navbar__link',
        styles.desktopButton,
        className,
      )}
      data-question-global-answer-toggle
      aria-label={label}
      aria-pressed={command.visible}
      title={label}
      onClick={handleClick}>
      <AnswerVisibilityIcon answersVisible={command.visible} />
      <span className={styles.desktopLabel}>{label}</span>
    </button>
  );
}
