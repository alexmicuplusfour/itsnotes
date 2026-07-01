import React from 'react';
import styled from 'styled-components';
import { getServerUrl } from '../services/api';
import { useUIPreferences } from '../contexts/UIPreferencesContext';

const Card = styled.a`
  /* Flex column so the image can shrink when the note card is tight on space,
     letting several previews compress to fit instead of overflowing. */
  display: flex;
  flex-direction: column;
  flex: 0 1 auto;
  min-height: 52px;
  text-decoration: none;
  color: inherit;
  border: 1px solid var(--border-transparent);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: opacity 0.15s ease;

  &:hover {
    opacity: 0.8;
  }
`;

const CardImage = styled.div`
  width: 100%;
  /* Basis of 130px but allowed to shrink to 0 (never grows), so the image is the
     part that gives when previews need to fit a bounded area. */
  flex: 0 1 130px;
  min-height: 0;
  background-image: url(${props => props.$src});
  background-size: cover;
  background-position: center;
  background-color: ${props => props.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'};
`;

const CardBody = styled.div`
  padding: 7px 10px 8px;
  flex-shrink: 0; /* keep the text (favicon/domain/title) legible; only the image shrinks */
`;

const CardMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 3px;
`;

const Favicon = styled.img`
  width: 13px;
  height: 13px;
  object-fit: contain;
  flex-shrink: 0;
`;

const Domain = styled.span`
  font-size: 11px;
  color: ${props => props.theme === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: ${props => props.$oneLine ? 1 : 2};
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--text-color);
`;

const CardDesc = styled.div`
  font-size: 12px;
  color: ${props => props.theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'};
  margin-top: 2px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: ${props => props.$oneLine ? 1 : 2};
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

function LinkPreviewCard({ link, isDark, showImage = true, oneLine = false }) {
  const { showLinkPreviews, showLinkPreviewImages } = useUIPreferences();
  const theme = isDark ? 'dark' : 'light';

  // Previews disabled entirely — render nothing (the data is still fetched/stored
  // server-side, so re-enabling shows them instantly without a refetch).
  if (!showLinkPreviews) return null;

  let domain = '';
  try {
    domain = new URL(link.url).hostname.replace(/^www\./, '');
  } catch {
    domain = link.url;
  }

  // Image shown only when the setting is on AND the caller allows it (hidden once
  // there are 3 cards, to keep them compact).
  const imageUrl = (showImage && showLinkPreviewImages) ? getServerUrl(link.image_url) : null;
  const faviconUrl = getServerUrl(link.favicon_url);

  return (
    <Card
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
    >
      {imageUrl && <CardImage $src={imageUrl} theme={theme} />}
      <CardBody>
        <CardMeta>
          {faviconUrl && (
            <Favicon
              src={faviconUrl}
              alt=""
              onError={e => { e.target.style.display = 'none'; }}
            />
          )}
          <Domain theme={theme}>{domain}</Domain>
        </CardMeta>
        {link.title && <CardTitle $oneLine={oneLine}>{link.title}</CardTitle>}
        {link.description && <CardDesc theme={theme} $oneLine={oneLine}>{link.description}</CardDesc>}
      </CardBody>
    </Card>
  );
}

export default LinkPreviewCard;
