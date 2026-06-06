import React from 'react';
import styled from 'styled-components';
import Icon from './Icons';

const SearchHelpContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(2px);
  padding: 20px;
`;

const SearchHelpContent = styled.div`
  background-color: var(--background-color);
  border-radius: 8px;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
  position: relative;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  color: var(--text-color);
`;

const SearchHelpHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 500;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-color);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    background-color: var(--button-hover-color);
  }
`;

const SearchHelpSection = styled.div`
  margin-bottom: 20px;
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 500;
  margin-top: 16px;
  margin-bottom: 8px;
`;

const OperatorsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
`;

const OperatorItem = styled.div`
  display: flex;
  gap: 8px;
`;

const OperatorSymbol = styled.code`
  background-color: var(--search-bg-color);
  color: var(--accent-color);
  padding: 0px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 14px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  min-width: 80px;
`;

const OperatorDescription = styled.div`
  font-size: 14px;
  color: var(--text-color);
`;

const ExampleContainer = styled.div`
  background-color: var(--note-bg-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
`;

const ExampleTitle = styled.div`
  font-weight: 500;
  margin-bottom: 8px;
  font-size: 15px;
  color: var(--accent-color);
`;

const ExampleText = styled.div`
  font-family: monospace;
  white-space: pre-wrap;
  font-size: 14px;
  color: var(--text-color);
`;

const SearchHelp = ({ onClose }) => {
  return (
    <SearchHelpContainer onClick={onClose}>
      <SearchHelpContent onClick={(e) => e.stopPropagation()}>
        <SearchHelpHeader>
          <Title>Advanced Search Guide</Title>
          <CloseButton onClick={onClose}>
            <Icon name="close" />
          </CloseButton>
        </SearchHelpHeader>

        <SearchHelpSection>
          <p>
            This search supports advanced operators to help you find your notes more efficiently.
          </p>
        </SearchHelpSection>

        <SearchHelpSection>
          <SectionTitle>Basic Search</SectionTitle>
          <p>
            Type any words to find notes containing all those words in any order.
          </p>
          <ExampleContainer>
            <ExampleTitle>Example:</ExampleTitle>
            <ExampleText>project meeting notes</ExampleText>
          </ExampleContainer>
        </SearchHelpSection>

        <SearchHelpSection>
          <SectionTitle>Advanced Operators</SectionTitle>
          <OperatorsList>
            <OperatorItem>
              <OperatorSymbol>"phrase"</OperatorSymbol>
              <OperatorDescription>
                Search for an exact phrase with words in that exact order.
              </OperatorDescription>
            </OperatorItem>
            
            <OperatorItem>
              <OperatorSymbol>term1 OR term2</OperatorSymbol>
              <OperatorDescription>
                Find notes containing either term1 or term2 (or both).
              </OperatorDescription>
            </OperatorItem>
            
            <OperatorItem>
              <OperatorSymbol>-word</OperatorSymbol>
              <OperatorDescription>
                Exclude notes containing this word.
              </OperatorDescription>
            </OperatorItem>
            
            <OperatorItem>
              <OperatorSymbol>word1 * word2</OperatorSymbol>
              <OperatorDescription>
                Find notes with word1 followed by any word, then word2.
              </OperatorDescription>
            </OperatorItem>
            
            <OperatorItem>
              <OperatorSymbol>(x OR y) z</OperatorSymbol>
              <OperatorDescription>
                Group terms with parentheses to create more complex queries.
              </OperatorDescription>
            </OperatorItem>
            
            <OperatorItem>
              <OperatorSymbol>#tag</OperatorSymbol>
              <OperatorDescription>
                Find notes with a specific tag.
              </OperatorDescription>
            </OperatorItem>
            
            <OperatorItem>
              <OperatorSymbol>$color</OperatorSymbol>
              <OperatorDescription>
                Find notes with a specific color (default, red, blue, etc.).
              </OperatorDescription>
            </OperatorItem>
            
            <OperatorItem>
              <OperatorSymbol>yr:YYYY[:MMM]</OperatorSymbol>
              <OperatorDescription>
                Find notes created in a specific year, or year and month (e.g., `yr:2024`, `yr:2024:mar`, `yr:2024:September`).
              </OperatorDescription>
            </OperatorItem>
          </OperatorsList>
        </SearchHelpSection>

        <SearchHelpSection>
          <SectionTitle>Examples</SectionTitle>
          
          <ExampleContainer>
            <ExampleTitle>Exact phrase search:</ExampleTitle>
            <ExampleText>"quarterly meeting" -cancelled</ExampleText>
          </ExampleContainer>
          
          <ExampleContainer>
            <ExampleTitle>Tags and colors:</ExampleTitle>
            <ExampleText>#important $red meeting</ExampleText>
          </ExampleContainer>
          
          <ExampleContainer>
            <ExampleTitle>OR with grouping:</ExampleTitle>
            <ExampleText>(zoom OR teams) meeting -cancelled</ExampleText>
          </ExampleContainer>
          
          <ExampleContainer>
            <ExampleTitle>Wildcards:</ExampleTitle>
            <ExampleText>marketing * strategy</ExampleText>
          </ExampleContainer>
          
          <ExampleContainer>
            <ExampleTitle>Year and Month search:</ExampleTitle>
            <ExampleText>yr:2024:dec #holidays</ExampleText>
          </ExampleContainer>
          
          <ExampleContainer>
            <ExampleTitle>Combined search:</ExampleTitle>
            <ExampleText>project (meeting OR planning) -cancelled #important $yellow yr:2023</ExampleText>
          </ExampleContainer>
        </SearchHelpSection>
      </SearchHelpContent>
    </SearchHelpContainer>
  );
};

export default SearchHelp;
