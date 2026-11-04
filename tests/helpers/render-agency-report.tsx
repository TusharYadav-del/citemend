import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgencyReportBrand, AgencyReportCTA } from "../../components/agency-report-brand";

const agency = { agency_brand_name: "Apex & Partners", agency_logo_url: "https://agency.example/logo.png", agency_primary_color: "#10B981", agency_cta_text: "Book a call", agency_cta_url: "https://agency.example/book" };
process.stdout.write(renderToStaticMarkup(<><AgencyReportBrand agency={agency} autoPrint={false} /><AgencyReportCTA agency={agency} /></>));
