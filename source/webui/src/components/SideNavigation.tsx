// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {SideNavigation} from "@cloudscape-design/components";
import React from "react";
import {useNavigate} from "react-router-dom";

export function Navigation() {
  const navigate = useNavigate();
  const [activeHref, setActiveHref] = React.useState(
      "/"
  );

  return (
      <SideNavigation
          activeHref={activeHref}
          onFollow={event => {
            if (!event.detail.external) {
              event.preventDefault();
              setActiveHref(event.detail.href);
              navigate(event.detail.href);
            }
          }}
          header={{
            text: "Account Assessment for AWS Organizations",
            href: "/"
          }}
          items={[
            {
              text: "Findings",
              type: "section",
              items: [
                {
                  text: "Resource-Based Policies",
                  type: "link",
                  href: "/assessments/resource-based-policy"
                },
                {
                  text: "Delegated Admin Accounts",
                  type: "link",
                  href: "/assessments/delegated-admin"
                },
                {
                  text: "Trusted Access",
                  type: "link",
                  href: "/assessments/trusted-access"
                }
              ]
            },
            {
              type: "divider"
            },
            {
              text: "Job History",
              type: "link",
              href: "/jobs"
            },
          ]}
      />
  );
}