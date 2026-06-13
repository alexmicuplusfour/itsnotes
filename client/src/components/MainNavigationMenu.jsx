import { memo, useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import Icon from './Icons';

const slideRight = keyframes`
  from { transform: translateX(-60px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`;

const slideLeft = keyframes`
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(-60px); opacity: 0; }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const fadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const SidebarBackdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.3);
  z-index: 10000;
  pointer-events: auto;
  animation: ${props => props.$isClosing ? fadeOut : fadeIn} 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
`;

const SidebarContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  height: 100%;
  background-color: var(--foreground-color);
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.3);
  border-radius: 0 16px 16px 0;
  z-index: 10001;
  width: 300px;
  padding: 16px;
  padding-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: auto;
  animation: ${props => props.$isClosing ? slideLeft : slideRight} 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;

  @media (max-width: 600px) {
    width: calc(100% - 80px);
  }
`;

const MenuItemsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  border-radius: 16px;
  padding: 10px;
  outline: ${props => props.$disabled ? 'none' : '1px solid var(--list-hover-color)' };
  outline-offset: -1px;
`;

const SidebarMenuList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: auto;
  padding-top: 16px;
  width: 100%;
`;

const MenuItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px 16px;
  cursor: ${props => props.$disabled ? 'default' : 'pointer'};
  border-radius: 12px;
  background-color: ${props => props.$disabled ? 'var(--menu-item-hover-bg)' : 'transparent' };
  transition: background-color 0.2s ease, border-color 0.2s ease;
  position: relative;
  z-index: 10002;
  pointer-events: auto;
  opacity: ${props => props.$disabled ? 0.5 : 1};
  text-align: center;

  &:hover {
    background-color: ${props => props.$disabled ? 'var(--menu-item-hover-bg)' : 'var(--menu-item-hover-bg)'};
    outline: none;
  }

  &:active {
  }

  svg {
    font-size: 28px;
    color: var(--text-color-contrast);
    transition: color 0.2s ease;
    pointer-events: none;
    flex-shrink: 0;
  }

  span {
    font-size: 13px;
    color: var(--text-color-contrast);
    font-weight: 500;
    pointer-events: none;
  }
`;

const SidebarMenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.2s ease;
  text-align: left;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;

  &:hover {
    background-color: var(--menu-item-hover-bg);
  }

  svg {
    font-size: 20px;
    color: var(--text-color-contrast);
    flex-shrink: 0;
  }

  span {
    font-size: 15px;
    color: var(--text-color-contrast);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const GithubLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-color-contrast);
  opacity: 0.5;
  text-decoration: none;
  transition: opacity 0.2s ease;
  align-self: flex-start;

  &:hover {
    opacity: 0.9;
  }

  svg {
    flex-shrink: 0;
  }
`;

const SidebarCloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 50%;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-color-contrast);
  transition: background-color 0.2s ease;

  &:hover {
    background-color: var(--menu-item-hover-bg);
  }

  svg {
    width: 24px;
    height: 24px;
  }
`;

const NavHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const MenuSeparator = styled.hr`
  margin: 6px 0;
  border: none;
  height: 1px;
  background-color: var(--menu-item-separator-light);
  width: 100%;
`;

const NavLogo = styled.svg`
  width: 120px;
  height: auto;
  color: var(--text-color-contrast);
  flex-shrink: 0;
  margin-left: 10px;
  padding-top: 4px;
`;

const MainNavigationMenu = memo(({
  isOpen,
  view,
  onClose,
  navigateTo,
  toggleTagsModal,
  setIsSettingsModalOpen,
  logout
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 300); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [isOpen, shouldRender]);

  if (!shouldRender) return null;

  return (
    <>
      <SidebarBackdrop
        $isClosing={isClosing}
        onClick={onClose}
      />
      <SidebarContainer
        $isClosing={isClosing}
        onClick={(e) => e.stopPropagation()}
      >
      <NavHeader>
      <NavLogo xmlns="http://www.w3.org/2000/svg" viewBox="0 0 246.656 68.937">
        <path fill="currentColor" fillRule="evenodd" d="M561.2,387.523a8.776,8.776,0,0,0-3.834-.923,7.143,7.143,0,0,0-3.479.816,2.4,2.4,0,0,0-1.491,2.1,2.145,2.145,0,0,0,1.242,1.917,14.367,14.367,0,0,0,3.373,1.278l5.325,1.278q5.325,1.278,7.916,4.082a9.462,9.462,0,0,1,2.592,6.639,9.3,9.3,0,0,1-1.065,4.331,11.6,11.6,0,0,1-3.018,3.656,14.789,14.789,0,0,1-4.686,2.521,18.9,18.9,0,0,1-6.07.923,19.9,19.9,0,0,1-6.071-.852,16.748,16.748,0,0,1-4.615-2.237,14.591,14.591,0,0,1-3.3-3.2,15.31,15.31,0,0,1-2.059-3.656l8.307-3.55a8.968,8.968,0,0,0,3.23,4.011,8.093,8.093,0,0,0,4.509,1.314,7.641,7.641,0,0,0,4.047-.923,2.622,2.622,0,0,0,1.491-2.2,2.722,2.722,0,0,0-1.243-2.308,12.892,12.892,0,0,0-4.3-1.6l-4.9-1.065a17.071,17.071,0,0,1-3.373-1.136,13.14,13.14,0,0,1-3.159-1.988,10.025,10.025,0,0,1-2.343-2.911,8.213,8.213,0,0,1-.923-3.976,9.223,9.223,0,0,1,1.1-4.544,10.265,10.265,0,0,1,3.018-3.373,14.441,14.441,0,0,1,4.508-2.129,20.049,20.049,0,0,1,5.574-.746,19.579,19.579,0,0,1,8.875,1.953,12.033,12.033,0,0,1,5.751,6.212l-8.023,3.266A6.163,6.163,0,0,0,561.2,387.523Zm-21.655,12.212h-26.2a9.765,9.765,0,0,0,1.172,3.656,8.82,8.82,0,0,0,2.2,2.556,8.527,8.527,0,0,0,2.875,1.491,11.168,11.168,0,0,0,3.195.462,9.062,9.062,0,0,0,5.29-1.455,10.619,10.619,0,0,0,3.3-3.657l7.739,3.834a19.49,19.49,0,0,1-6.5,6.887,18.06,18.06,0,0,1-9.976,2.627,19.159,19.159,0,0,1-7.348-1.384,17.527,17.527,0,0,1-9.727-9.728,19.348,19.348,0,0,1-1.385-7.419,19.047,19.047,0,0,1,1.349-7.136,18,18,0,0,1,9.479-9.9,17.474,17.474,0,0,1,7.277-1.491,18.946,18.946,0,0,1,7.455,1.384,15.233,15.233,0,0,1,5.467,3.834,16.507,16.507,0,0,1,3.337,5.787,22.348,22.348,0,0,1,1.136,7.242v0.852a4.824,4.824,0,0,0-.071.781A4.018,4.018,0,0,0,539.546,399.735Zm-9.478-8.662a7.263,7.263,0,0,0-1.562-2.13,8.2,8.2,0,0,0-2.556-1.633,9.45,9.45,0,0,0-3.657-.639,8.52,8.52,0,0,0-5.254,1.7,8.994,8.994,0,0,0-3.195,4.757h16.827A6.02,6.02,0,0,0,530.068,391.073Zm-36.849,13.3a3.745,3.745,0,0,0,.959,1.793,3.515,3.515,0,0,0,2.84,1.17,5.174,5.174,0,0,0,3.266-.923l2.627,8.165a15.431,15.431,0,0,1-3.515,1.172,20.571,20.571,0,0,1-4.153.39,12.691,12.691,0,0,1-4.722-.833,10.041,10.041,0,0,1-3.514-2.283q-3.339-3.262-3.337-9.277V388.162h-6.106V380.21h6.106V369.56h9.3v10.65h8.52v7.952h-8.52v13.9A10.081,10.081,0,0,0,493.219,404.369Zm-21.725,6.548a17.584,17.584,0,0,1-5.822,3.835,20.58,20.58,0,0,1-14.839,0,17.212,17.212,0,0,1-9.656-9.692,20.756,20.756,0,0,1,0-14.91,17.2,17.2,0,0,1,9.656-9.692,20.58,20.58,0,0,1,14.839,0,17.2,17.2,0,0,1,9.656,9.692,20.77,20.77,0,0,1,0,14.91A17.476,17.476,0,0,1,471.494,410.917Zm-4.828-17.5a9.262,9.262,0,0,0-2.024-3.124,8.8,8.8,0,0,0-2.946-1.953,9.125,9.125,0,0,0-3.444-.674,9.034,9.034,0,0,0-3.479.674,8.9,8.9,0,0,0-2.911,1.953,9.26,9.26,0,0,0-2.023,3.124,12.134,12.134,0,0,0,0,8.378,9.25,9.25,0,0,0,2.023,3.124,8.861,8.861,0,0,0,2.911,1.952,9.213,9.213,0,0,0,6.923,0,8.771,8.771,0,0,0,2.946-1.952,9.253,9.253,0,0,0,2.024-3.124A12.149,12.149,0,0,0,466.666,393.416ZM441,427.1c-1.02,0-2.008-.063-2.964-0.124-3.469-.218-5.981-0.38-9.006,2.095a15.966,15.966,0,0,1-9.4,3.445,8.737,8.737,0,0,1-4.929-1.392,7.591,7.591,0,0,1-3.316-5.711c-4.206,2.718-8.939,5.715-13.385,5.715V422.11c1.817,0,6.089-2.762,8.641-4.413,4.76-3.08,8.874-5.738,12.538-2.978,3.1,2.334,2.431,6.346,1.873,8.525a6.593,6.593,0,0,0,2.106-1.09c5.851-4.789,11.409-4.432,15.465-4.177,0.808,0.051,1.6.105,2.377,0.105V427.1ZM432.759,415h-6.172V395.049q0-3.762-1.668-5.573a6.285,6.285,0,0,0-4.864-1.811,6.785,6.785,0,0,0-3.372.816,7.861,7.861,0,0,0-2.485,2.2,9.96,9.96,0,0,0-1.562,3.266,14.677,14.677,0,0,0-.533,4.012v13.548a43.969,43.969,0,0,0-5.462,3.189l-0.469.3H402.8V380.21h8.733v4.544H412.1a11.805,11.805,0,0,1,4.4-4.154,12.877,12.877,0,0,1,6.319-1.526,14.5,14.5,0,0,1,5.751,1.065,10.538,10.538,0,0,1,4.083,3.017,13.359,13.359,0,0,1,2.414,4.686,21.221,21.221,0,0,1,.816,6.071v20.941A23.875,23.875,0,0,0,432.759,415Zm-49.34-22.294,5.325,1.278q5.325,1.278,7.917,4.082a9.461,9.461,0,0,1,2.591,6.639,9.3,9.3,0,0,1-1.065,4.331,11.606,11.606,0,0,1-3.017,3.656,14.789,14.789,0,0,1-4.686,2.521,18.9,18.9,0,0,1-6.071.923,19.9,19.9,0,0,1-6.07-.852,16.735,16.735,0,0,1-4.615-2.237,14.617,14.617,0,0,1-3.3-3.2,15.379,15.379,0,0,1-2.059-3.656l8.307-3.55a8.976,8.976,0,0,0,3.231,4.011,8.092,8.092,0,0,0,4.508,1.314,7.641,7.641,0,0,0,4.047-.923,2.622,2.622,0,0,0,1.491-2.2,2.721,2.721,0,0,0-1.242-2.308,12.9,12.9,0,0,0-4.3-1.6l-4.9-1.065a17.063,17.063,0,0,1-3.372-1.136,13.166,13.166,0,0,1-3.16-1.988,10.058,10.058,0,0,1-2.343-2.911,8.224,8.224,0,0,1-.923-3.976,9.223,9.223,0,0,1,1.1-4.544,10.25,10.25,0,0,1,3.017-3.373,14.447,14.447,0,0,1,4.509-2.129,20.036,20.036,0,0,1,5.573-.746,19.573,19.573,0,0,1,8.875,1.953,12.025,12.025,0,0,1,5.751,6.212l-8.023,3.266a6.158,6.158,0,0,0-2.911-2.982,8.776,8.776,0,0,0-3.834-.923,7.146,7.146,0,0,0-3.479.816,2.4,2.4,0,0,0-1.491,2.1,2.145,2.145,0,0,0,1.243,1.917A14.358,14.358,0,0,0,383.419,392.706Zm-26.8,11.663a3.745,3.745,0,0,0,.959,1.793,3.515,3.515,0,0,0,2.84,1.17,5.174,5.174,0,0,0,3.266-.923l2.627,8.165a15.431,15.431,0,0,1-3.515,1.172,20.571,20.571,0,0,1-4.153.39,12.691,12.691,0,0,1-4.722-.833,10.041,10.041,0,0,1-3.514-2.283q-3.339-3.262-3.337-9.277V388.162h-6.106V380.21h6.106V369.56h9.3v10.65h8.52v7.952h-8.52v13.9A10.081,10.081,0,0,0,356.618,404.369Zm-24.459-28.845a5.992,5.992,0,0,1-4.224-1.739,6,6,0,0,1-1.278-1.882,6.172,6.172,0,0,1,0-4.686,6.011,6.011,0,0,1,1.278-1.882,5.992,5.992,0,0,1,4.224-1.739,5.874,5.874,0,0,1,4.26,1.739,5.916,5.916,0,0,1,0,8.45A5.87,5.87,0,0,1,332.159,375.524ZM336.845,415h-9.3V380.21h9.3V415Z" transform="translate(-326.188 -363.594)" />
      </NavLogo>
      <SidebarCloseButton
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="Close menu"
      >
        <Icon name="arrow_left_caret" size={24} />
      </SidebarCloseButton>
      </NavHeader>

      <MenuItemsGrid>
        <MenuItem
          $disabled={view === 'main'}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (view === 'main') return;
            onClose();
            navigateTo('/', 'main');
          }}
        >
          <Icon name="notes" size={24} />
          <span>Notes</span>
        </MenuItem>
        <MenuItem
          $disabled={view === 'archive'}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (view === 'archive') return;
            onClose();
            navigateTo('/archive', 'archive');
          }}
        >
          <Icon name="archive" size={24} />
          <span>Archive</span>
        </MenuItem>
        <MenuItem
          $disabled={view === 'trash'}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (view === 'trash') return;
            onClose();
            navigateTo('/trash', 'trash');
          }}
        >
          <Icon name="trash" size={24} />
          <span>Trash</span>
        </MenuItem>
        <MenuItem onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClose();
          toggleTagsModal();
        }}>
          <Icon name="tag" size={24} />
          <span>Tags / Folders</span>
        </MenuItem>
      </MenuItemsGrid>

      

      <SidebarMenuList>
        <SidebarMenuItem onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsSettingsModalOpen(true);
          onClose();
        }}>
          <Icon name="settings" size={20} />
          <span>Settings</span>
        </SidebarMenuItem>
        <SidebarMenuItem onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          logout();
          onClose();
        }}>
          <Icon name="signOut" size={20} />
          <span>Sign Out</span>
        </SidebarMenuItem>
        <GithubLink
          href="https://github.com/alexmicuplusfour/itsnotes"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="github" size={12} />
          <span>GitHub</span>
        </GithubLink>
      </SidebarMenuList>
    </SidebarContainer>
    </>
  );
});

MainNavigationMenu.displayName = 'MainNavigationMenu';

export default MainNavigationMenu;
