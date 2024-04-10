// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {ContentLayout, Header, SpaceBetween} from "@cloudscape-design/components"
import {SearchForm} from "./SearchForm"
import {PolicyExplorerTable} from "./PolicyExplorerTable"
import {useState} from "react";
import {TableState} from "../../util/AssessmentResultTable.tsx";
import {contentDisplayItems} from "./PolicyExplorerDefinitions.tsx";

export const PolicyExplorerPage = () => {

  const initialTableState = {
    header: "Policies",
    start: 1,
    itemsPerPage: 20,
    contentDisplayOption: contentDisplayItems
  };
  const [tableState, setTableState] = useState<TableState>(initialTableState);

  return (
    <ContentLayout
      header={
        <Header variant="h1">Policy Explorer</Header>
      }
    >
      <SpaceBetween size={"l"}>
        <SearchForm
          resetTableState={() => setTableState(initialTableState)}
        ></SearchForm>
        <PolicyExplorerTable
          tableState={tableState}
          setTableState={setTableState}
        ></PolicyExplorerTable>
      </SpaceBetween>
    </ContentLayout>
  )
}