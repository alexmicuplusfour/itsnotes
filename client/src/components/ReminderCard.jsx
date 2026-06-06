import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { NodeViewWrapper } from '@tiptap/react';
import Icon from './Icons';
import api from '../services/api';

const CardContainer = styled.div`
  display: flex;
  align-items: center;
  background-color: var(--fill-subtle);
  border: 1px solid var(--border-transparent);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 8px 0;
  width: calc(100% - 8px);
  cursor: default;
  transition: background-color 0.2s;
  position: relative;
  overflow: hidden;
  user-select: none;
`;

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  color: var(--text-color);
  opacity: 0.8;
`;

const ContentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
`;

const PrimaryText = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  line-height: 1.4;
  margin-bottom: 2px;
`;

const SecondaryText = styled.div`
  font-size: 12px;
  color: var(--text-secondary-color);
  line-height: 1.4;
`;

const SkipLink = styled.button`
  background: none;
  border: none;
  color: var(--link);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  margin-left: 12px;
  text-decoration: none;
  font-weight: 500;
  transition: opacity 0.2s;

  &:hover {
    text-decoration: underline;
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DeleteButton = styled.button`
  background: none;
  border: none;
  color: var(--text-secondary-color);
  opacity: 0; 
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin-left: 4px;
  transition: all 0.2s;

  &:hover {
    background-color: var(--hover-overlay);
    color: var(--text-color);
    opacity: 1;
  }

  ${CardContainer}:hover & {
    opacity: 1;
  }
`;

const ReminderCard = (props) => {
    const { rrule, nextRunAt, timezone, matchedText, scheduleSummary, reminderId } = props.node.attrs;
    const [timeRemaining, setTimeRemaining] = useState('');
    const [liveNextRunAt, setLiveNextRunAt] = useState(null);
    const [isSkipping, setIsSkipping] = useState(false);

    useEffect(() => {
        if (!reminderId) return;

        const fetchReminder = async () => {
            try {
                const response = await api.get(`/reminders/${reminderId}`);
                if (response.data && response.data.next_run_at) {
                    setLiveNextRunAt(response.data.next_run_at);
                }
            } catch (error) {
                console.error('Failed to fetch live reminder data:', error);
            }
        };

        fetchReminder();
    }, [reminderId]);

    const effectiveNextRunAt = liveNextRunAt || nextRunAt;
    const nextRunDate = effectiveNextRunAt ? parseISO(effectiveNextRunAt) : null;
    // For recurring, prioritize the summary. 
    // If no summary (legacy or error), use matchedText (intention).
    const isRecurring = !!rrule;

    useEffect(() => {
        if (!nextRunDate) return;

        const updateTime = () => {
            const now = new Date();
            if (nextRunDate > now) {
                setTimeRemaining(formatDistanceToNow(nextRunDate, { addSuffix: true }));
            } else {
                setTimeRemaining('Due now');
            }
        };

        updateTime();
        const interval = setInterval(updateTime, 60000); // Update every minute
        return () => clearInterval(interval);
    }, [nextRunDate]);

    const handleDelete = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Optimistic UI update: remove node immediately
        props.deleteNode();

        if (reminderId) {
            try {
                await api.delete(`/reminders/${reminderId}`);
                console.log('Reminder deleted:', reminderId);
            } catch (error) {
                console.error('Failed to delete reminder:', error);
                // Note: We can't easily undo the node deletion here without context
            }
        }
    };

    const handleSkip = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!reminderId || !isRecurring) return;

        setIsSkipping(true);
        try {
            const response = await api.patch(`/reminders/${reminderId}/skip`);
            if (response.data && response.data.next_run_at) {
                setLiveNextRunAt(response.data.next_run_at);
                console.log('Reminder skipped, new next run:', response.data.next_run_at);
            }
        } catch (error) {
            console.error('Failed to skip reminder:', error);
        } finally {
            setIsSkipping(false);
        }
    };

    if (!nextRunDate) return null;

    // Format date for display (include year if not current year)
    const currentYear = new Date().getFullYear();
    const nextRunYear = nextRunDate.getFullYear();
    const dateFormat = nextRunYear !== currentYear ? 'MMM d, yyyy, h:mm a' : 'MMM d, h:mm a';
    const formattedDate = format(nextRunDate, dateFormat);

    // For recurring, prioritize the summary. 
    // If no summary (legacy or error), use matchedText (intention).
    const titleText = isRecurring
        ? (scheduleSummary || matchedText || 'Recurring Reminder')
        : formattedDate;

    return (
        <NodeViewWrapper className="reminder-card-component">
            <CardContainer contentEditable={false}>
                <IconWrapper>
                    <Icon name="bell" size={24} />
                </IconWrapper>
                <ContentWrapper>
                    {isRecurring ? (
                        <>
                            <PrimaryText>{titleText}</PrimaryText>
                            <SecondaryText>
                                Next run → {formattedDate}
                                <SkipLink
                                    onClick={handleSkip}
                                    disabled={isSkipping}
                                    title="Skip to next occurrence"
                                >
                                    {isSkipping ? 'Skipping...' : 'Skip'}
                                </SkipLink>
                            </SecondaryText>
                        </>
                    ) : (
                        <>
                            <PrimaryText>{formattedDate}</PrimaryText>
                            <SecondaryText>{timeRemaining}</SecondaryText>
                        </>
                    )}
                </ContentWrapper>
                <DeleteButton onClick={handleDelete} title="Delete reminder">
                    <Icon name="trash" size={18} />
                </DeleteButton>
            </CardContainer>

        </NodeViewWrapper>
    );
};

export default ReminderCard;
